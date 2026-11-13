import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { AwsClient } from "aws4fetch";
import type { DatasetStorageConfig } from "./factory.js";

export interface PutOptions {
  contentType: string;
  cacheControl?: string;
}

/** Public download files under `downloads/`, in the same bucket as the private datasets. */
export interface ObjectStorage {
  put(key: string, body: Uint8Array | string, options: PutOptions): Promise<void>;
  get(key: string): Promise<Uint8Array | undefined>;
}

function assertKey(key: string): void {
  const segments = key.split("/");
  if (!key || key.startsWith("/") || segments.some((s) => !s || s === "." || s === "..")) {
    throw new Error(`Invalid object key "${key}"`);
  }
}

export class LocalObjectStorage implements ObjectStorage {
  constructor(private readonly rootDir: string) {}

  async put(key: string, body: Uint8Array | string): Promise<void> {
    assertKey(key);
    const file = path.join(this.rootDir, ...key.split("/"));
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
  }

  async get(key: string): Promise<Uint8Array | undefined> {
    assertKey(key);
    try {
      return await readFile(path.join(this.rootDir, ...key.split("/")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }
}

export class R2ObjectStorage implements ObjectStorage {
  private readonly client: AwsClient;
  private readonly endpoint: string;

  constructor(config: Extract<DatasetStorageConfig, { driver: "r2" }>) {
    this.client = new AwsClient({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      service: "s3",
      region: "auto"
    });
    this.endpoint = `https://${config.accountId}.r2.cloudflarestorage.com/${config.bucketName}`;
  }

  private url(key: string): string {
    return `${this.endpoint}/${key.split("/").map(encodeURIComponent).join("/")}`;
  }

  async put(key: string, body: Uint8Array | string, options: PutOptions): Promise<void> {
    assertKey(key);
    const headers: Record<string, string> = { "content-type": options.contentType };
    if (options.cacheControl) headers["cache-control"] = options.cacheControl;

    const response = await this.client.fetch(this.url(key), { method: "PUT", body, headers });
    if (!response.ok) {
      throw new Error(`Failed to upload "${key}": ${response.status} ${response.statusText}`);
    }
  }

  async get(key: string): Promise<Uint8Array | undefined> {
    assertKey(key);
    const response = await this.client.fetch(this.url(key));
    if (response.status === 404) return undefined;
    if (!response.ok) {
      throw new Error(`Failed to fetch "${key}": ${response.status} ${response.statusText}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }
}

/** Same driver selection as dataset storage; local objects live under the configured path. */
export function createObjectStorage(config: DatasetStorageConfig): ObjectStorage {
  return config.driver === "r2" ? new R2ObjectStorage(config) : new LocalObjectStorage(config.path);
}
