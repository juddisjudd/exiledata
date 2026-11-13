import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DatasetMetadata, Game } from "@exiledata/schema";
import { datasetKey } from "./keys.js";
import type { DatasetStorage, StoredDataset } from "./types.js";

export class LocalDatasetStorage implements DatasetStorage {
  constructor(private readonly rootDir: string) {}

  private filePath(game: Game, gameVersion: string): string {
    return path.join(this.rootDir, datasetKey(game, gameVersion));
  }

  async put(metadata: DatasetMetadata, data: string): Promise<void> {
    const filePath = this.filePath(metadata.game, metadata.gameVersion);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, data, "utf8");
  }

  async get(game: Game, gameVersion: string): Promise<string | undefined> {
    try {
      return await readFile(this.filePath(game, gameVersion), "utf8");
    } catch (error) {
      if (isNotFound(error)) return undefined;
      throw error;
    }
  }

  async list(game: Game): Promise<StoredDataset[]> {
    let versions: string[];
    try {
      versions = await readdir(path.join(this.rootDir, game));
    } catch (error) {
      if (isNotFound(error)) return [];
      throw error;
    }

    const datasets: StoredDataset[] = [];
    for (const gameVersion of versions) {
      try {
        const info = await stat(this.filePath(game, gameVersion));
        datasets.push({
          game,
          gameVersion,
          etag: `${info.mtimeMs}-${info.size}`,
          size: info.size,
          lastModified: info.mtime.toISOString()
        });
      } catch (error) {
        if (!isNotFound(error)) throw error;
      }
    }
    return datasets;
  }

  async delete(game: Game, gameVersion: string): Promise<void> {
    await rm(path.dirname(this.filePath(game, gameVersion)), { recursive: true, force: true });
  }
}

function isNotFound(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}
