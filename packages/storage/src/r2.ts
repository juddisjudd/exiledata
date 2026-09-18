import { AwsClient } from "aws4fetch";
import type { DatasetMetadata, Game } from "@exiledata/schema";
import { datasetKey } from "./keys.js";
import type { DatasetStorage, StoredDataset } from "./types.js";

export interface R2DatasetStorageConfig {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
}

/**
 * R2-backed dataset storage using R2's S3-compatible API. Uses `aws4fetch` (a minimal SigV4
 * signer) rather than the full AWS SDK — R2 access doesn't need most of what the AWS SDK offers.
 *
 * Object key layout: `{game}/{gameVersion}/dataset.json`, matching the local driver.
 */
export class R2DatasetStorage implements DatasetStorage {
  private readonly client: AwsClient;
  private readonly endpoint: string;

  constructor(config: R2DatasetStorageConfig) {
    this.client = new AwsClient({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      service: "s3",
      region: "auto"
    });
    this.endpoint = `https://${config.accountId}.r2.cloudflarestorage.com/${config.bucketName}`;
  }

  async put(metadata: DatasetMetadata, data: string): Promise<void> {
    const key = datasetKey(metadata.game, metadata.gameVersion);
    const response = await this.client.fetch(`${this.endpoint}/${key}`, {
      method: "PUT",
      body: data,
      headers: { "content-type": "application/json" }
    });

    if (!response.ok) {
      throw new Error(
        `Failed to upload dataset "${key}": ${response.status} ${response.statusText}`
      );
    }
  }

  async get(game: Game, gameVersion: string): Promise<string | undefined> {
    const key = datasetKey(game, gameVersion);
    const response = await this.client.fetch(`${this.endpoint}/${key}`);

    if (response.status === 404) return undefined;
    if (!response.ok) {
      throw new Error(
        `Failed to fetch dataset "${key}": ${response.status} ${response.statusText}`
      );
    }

    return response.text();
  }

  async list(game: Game): Promise<StoredDataset[]> {
    const datasets: StoredDataset[] = [];
    let continuationToken: string | undefined;

    do {
      const params = new URLSearchParams({ "list-type": "2", prefix: `${game}/` });
      if (continuationToken) params.set("continuation-token", continuationToken);

      const response = await this.client.fetch(`${this.endpoint}?${params}`);
      if (!response.ok) {
        throw new Error(
          `Failed to list datasets for "${game}": ${response.status} ${response.statusText}`
        );
      }

      const xml = await response.text();
      for (const [, block = ""] of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
        const gameVersion = /^[^/]+\/([^/]+)\/dataset\.json$/.exec(tag(block, "Key") ?? "")?.[1];
        if (!gameVersion) continue;

        datasets.push({
          game,
          gameVersion,
          etag: (tag(block, "ETag") ?? "").replace(/&quot;|"/g, ""),
          size: Number(tag(block, "Size") ?? 0),
          lastModified: tag(block, "LastModified") ?? ""
        });
      }

      continuationToken =
        tag(xml, "IsTruncated") === "true" ? tag(xml, "NextContinuationToken") : undefined;
    } while (continuationToken);

    return datasets;
  }

  async delete(game: Game, gameVersion: string): Promise<void> {
    const key = datasetKey(game, gameVersion);
    const response = await this.client.fetch(`${this.endpoint}/${key}`, { method: "DELETE" });

    if (!response.ok && response.status !== 404) {
      throw new Error(
        `Failed to delete dataset "${key}": ${response.status} ${response.statusText}`
      );
    }
  }
}

function tag(xml: string, name: string): string | undefined {
  return new RegExp(`<${name}>([^<]*)</${name}>`).exec(xml)?.[1];
}
