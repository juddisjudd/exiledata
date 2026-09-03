import { AwsClient } from "aws4fetch";
import type { DatasetMetadata, Game } from "@exiledata/schema";
import type { DatasetStorage } from "./types.js";

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
 * Object key layout: `{game}/{datasetVersion}/dataset.json`, matching the local driver.
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

  private key(game: Game, datasetVersion: string): string {
    return `${game}/${datasetVersion}/dataset.json`;
  }

  async put(metadata: DatasetMetadata, data: string): Promise<void> {
    const key = this.key(metadata.game, metadata.datasetVersion);
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

  async get(game: Game, datasetVersion: string): Promise<string | undefined> {
    const key = this.key(game, datasetVersion);
    const response = await this.client.fetch(`${this.endpoint}/${key}`);

    if (response.status === 404) return undefined;
    if (!response.ok) {
      throw new Error(
        `Failed to fetch dataset "${key}": ${response.status} ${response.statusText}`
      );
    }

    return response.text();
  }

  async listVersions(game: Game): Promise<string[]> {
    const prefix = `${game}/`;
    const response = await this.client.fetch(
      `${this.endpoint}?list-type=2&prefix=${encodeURIComponent(prefix)}&delimiter=/`
    );

    if (!response.ok) {
      throw new Error(
        `Failed to list datasets for "${game}": ${response.status} ${response.statusText}`
      );
    }

    const xml = await response.text();
    const prefixes = [...xml.matchAll(/<Prefix>([^<]+)<\/Prefix>/g)]
      .map((match) => match[1])
      .filter((value): value is string => value !== undefined);

    return prefixes
      .map((p) => p.slice(prefix.length).replace(/\/$/, ""))
      .filter((version) => version.length > 0);
  }
}
