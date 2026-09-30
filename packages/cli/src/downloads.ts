import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  createDatasetStorage,
  createObjectStorage,
  datasetStorageConfigFromEnv,
  describeDatasetStorage,
  type ObjectStorage
} from "@exiledata/storage";
import { SCHEMA_VERSION, type Dataset } from "@exiledata/schema";
import { parseGame } from "./games.js";
import { megabytes, printTable, shortTime } from "./format.js";
import { buildRelease, mergeIndex, type DownloadIndex, type Manifest } from "./release.js";

export const DOWNLOADS_PREFIX = "downloads";
const IMMUTABLE = "public, max-age=31536000, immutable";
const SHORT = "public, max-age=60";
const UPLOAD_CONCURRENCY = 8;

const CONTENT_TYPES: Record<string, string> = {
  ".json": "application/json; charset=utf-8",
  ".lua": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".zst": "application/zstd",
  ".zip": "application/zip"
};

export const contentType = (file: string) =>
  CONTENT_TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";

export async function readJson<T>(store: ObjectStorage, key: string): Promise<T | undefined> {
  const data = await store.get(key);
  return data ? (JSON.parse(Buffer.from(data).toString("utf8")) as T) : undefined;
}

/**
 * Publishes one extract as public downloads under `downloads/{game}/{patch}/`, then adds the
 * patch to `downloads/index.json`. The index is written last, so a failed upload never
 * advertises a half-published patch.
 */
export async function publishDownloads(options: {
  game: string;
  extractDir: string;
  overwrite?: boolean;
  dryRun?: boolean;
  /** The patch's normalized dataset, when it is not in storage, as after `ingest --dry-run`. */
  dataset?: Dataset;
  store?: ObjectStorage;
  env?: NodeJS.ProcessEnv;
  log?: (line: string) => void;
}): Promise<Manifest> {
  const log = options.log ?? console.log;
  const game = parseGame(options.game);
  const config = datasetStorageConfigFromEnv(options.env ?? process.env);
  const store = options.store ?? createObjectStorage(config);
  const gameVersion = (await readFile(path.join(options.extractDir, "version.txt"), "utf8")).trim();
  const prefix = `${DOWNLOADS_PREFIX}/${game}/${gameVersion}`;

  const existing = await store.get(`${prefix}/manifest.json`);
  if (existing && !options.overwrite) {
    throw new Error(`${game} ${gameVersion} is already published. Pass --overwrite to replace it.`);
  }

  let dataset = options.dataset;
  if (!dataset) {
    const raw = await createDatasetStorage(config).get(game, gameVersion);
    if (!raw) {
      throw new Error(
        `No normalized dataset for ${game} ${gameVersion} in ${describeDatasetStorage(config)}. ` +
          "Run `exiledata ingest` for this patch first."
      );
    }
    dataset = JSON.parse(raw) as Dataset;
  }

  const release = await buildRelease({
    game,
    extractDir: options.extractDir,
    gameVersion,
    schemaVersion: dataset.metadata.schemaVersion ?? SCHEMA_VERSION,
    normalized: { base_items: dataset.entities }
  });
  const { manifest, objects } = release;
  const total = [...objects.values()].reduce((sum, data) => sum + data.byteLength, 0);
  const trees = manifest.trees ?? [];
  log(
    `${game} ${gameVersion}: ${manifest.files.length} files (${objects.size} objects, ` +
      `${megabytes(total)}), archive ${megabytes(manifest.archive.bytes)}` +
      (trees.length ? `, PoB trees ${trees.map((t) => t.version).join(", ")}.` : ".")
  );
  if (options.dryRun) {
    log("--dry-run: nothing uploaded.");
    return manifest;
  }

  const queue = [...objects.entries()];
  let done = 0;
  await Promise.all(
    Array.from({ length: UPLOAD_CONCURRENCY }, async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        const [file, data] = next;
        await store.put(`${prefix}/${file}`, data, {
          contentType: contentType(file),
          cacheControl: IMMUTABLE
        });
        if (++done % 250 === 0) log(`  uploaded ${done}/${objects.size}`);
      }
    })
  );

  await store.put(`${prefix}/manifest.json`, JSON.stringify(manifest, null, 2) + "\n", {
    contentType: contentType("manifest.json"),
    cacheControl: SHORT
  });
  const index = mergeIndex(
    await readJson<DownloadIndex>(store, `${DOWNLOADS_PREFIX}/index.json`),
    manifest
  );
  await store.put(`${DOWNLOADS_PREFIX}/index.json`, JSON.stringify(index, null, 2) + "\n", {
    contentType: contentType("index.json"),
    cacheControl: SHORT
  });

  log(`Published ${game} ${gameVersion}; latest ${game} is ${index.games[game]!.latest}.`);
  return manifest;
}

export async function listDownloads(options: { env?: NodeJS.ProcessEnv } = {}): Promise<void> {
  const config = datasetStorageConfigFromEnv(options.env ?? process.env);
  const index = await readJson<DownloadIndex>(
    createObjectStorage(config),
    `${DOWNLOADS_PREFIX}/index.json`
  );
  console.log(`Downloads in ${describeDatasetStorage(config)}:`);
  const rows = Object.entries(index?.games ?? {}).flatMap(([game, entry]) =>
    entry.versions.map((v) => [
      game,
      v.gameVersion + (v.gameVersion === entry.latest ? " (latest)" : ""),
      String(v.files),
      megabytes(v.bytes),
      megabytes(v.archive.bytes),
      shortTime(v.generatedAt)
    ])
  );
  if (rows.length === 0) console.log("(none)");
  else printTable(["GAME", "PATCH", "FILES", "SIZE", "ZIP", "PUBLISHED (UTC)"], rows);
}
