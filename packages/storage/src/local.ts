import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DatasetMetadata, Game } from "@exiledata/schema";
import type { DatasetStorage } from "./types.js";

/**
 * Filesystem-backed dataset storage for local development, mirroring the
 * `dataset/{game}/{datasetVersion}/dataset.json` layout described in the root README.
 */
export class LocalDatasetStorage implements DatasetStorage {
  constructor(private readonly rootDir: string) {}

  private filePath(game: Game, datasetVersion: string): string {
    return path.join(this.rootDir, game, datasetVersion, "dataset.json");
  }

  async put(metadata: DatasetMetadata, data: string): Promise<void> {
    const filePath = this.filePath(metadata.game, metadata.datasetVersion);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, data, "utf8");
  }

  async get(game: Game, datasetVersion: string): Promise<string | undefined> {
    try {
      return await readFile(this.filePath(game, datasetVersion), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }

  async listVersions(game: Game): Promise<string[]> {
    try {
      return await readdir(path.join(this.rootDir, game));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }
}
