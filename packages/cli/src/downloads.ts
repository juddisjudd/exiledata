import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  compareGameVersions,
  createDatasetStorage,
  createObjectStorage,
  datasetStorageConfigFromEnv,
  describeDatasetStorage,
  type DatasetStorage,
  type ObjectStorage
} from "@exiledata/storage";
import { SCHEMA_VERSION, type Dataset, type Game } from "@exiledata/schema";
import { GAMES, parseGame } from "./games.js";
import { megabytes, printTable, shortTime } from "./format.js";
import { buildRelease, mergeIndex, type DownloadIndex, type Manifest } from "./release.js";

export const DOWNLOADS_PREFIX = "downloads";
/** Kept to re-fit the next patch against, since GGG's CDN drops a patch once the next ships. */
export const TABLES_PREFIX = "refit";
export const KEEP_PATCHES = 2;
const IMMUTABLE = "public, max-age=31536000, immutable";
const SHORT = "public, max-age=60";
const UPLOAD_CONCURRENCY = 8;
const DELETE_CONCURRENCY = 16;

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

/** Writes the index last, so a failed upload never lists a half-published patch. */
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

/** Writes the index first, so the Downloads page never lists a patch whose files are gone. */
export async function prunePatches(options: {
  games: Game[];
  store: ObjectStorage;
  datasets: DatasetStorage;
  keep?: number;
  dryRun?: boolean;
  log?: (line: string) => void;
  now?: Date;
}): Promise<Partial<Record<Game, string[]>>> {
  const { store, datasets } = options;
  const log = options.log ?? console.log;
  const keep = options.keep ?? KEEP_PATCHES;
  const indexKey = `${DOWNLOADS_PREFIX}/index.json`;
  const index = await readJson<DownloadIndex>(store, indexKey);
  const removed: Partial<Record<Game, string[]>> = {};
  const keys: string[] = [];
  const stored: Array<[Game, string]> = [];

  for (const game of options.games) {
    const entry = index?.games[game];
    const newest = (entry?.versions ?? [])
      .map((v) => v.gameVersion)
      .sort((a, b) => compareGameVersions(game, b, a))
      .slice(0, keep);
    const oldestKept = newest.at(-1);
    if (!entry || !oldestKept) continue;
    const isOld = (version: string) => compareGameVersions(game, version, oldestKept) < 0;

    const versions = new Set(entry.versions.map((v) => v.gameVersion).filter(isOld));
    for (const folder of [DOWNLOADS_PREFIX, TABLES_PREFIX].map((p) => `${p}/${game}`)) {
      for (const key of await store.list(folder)) {
        const [version, ...rest] = key.slice(folder.length + 1).split("/");
        if (!version || rest.length === 0 || !isOld(version)) continue;
        versions.add(version);
        keys.push(key);
      }
    }
    for (const { gameVersion } of await datasets.list(game)) {
      if (!isOld(gameVersion)) continue;
      versions.add(gameVersion);
      stored.push([game, gameVersion]);
    }
    if (versions.size === 0) continue;

    const old = [...versions].sort((a, b) => compareGameVersions(game, b, a));
    removed[game] = old;
    log(`${game}: keeping ${newest.join(", ")}; removing ${old.join(", ")}`);
    entry.versions = entry.versions.filter((v) => !isOld(v.gameVersion));
  }
  if (options.dryRun || !index || Object.keys(removed).length === 0) return removed;

  index.updatedAt = (options.now ?? new Date()).toISOString();
  await store.put(indexKey, JSON.stringify(index, null, 2) + "\n", {
    contentType: contentType("index.json"),
    cacheControl: SHORT
  });
  const queue = [...keys];
  await Promise.all(
    Array.from({ length: DELETE_CONCURRENCY }, async () => {
      for (let key = queue.shift(); key; key = queue.shift()) await store.delete(key);
    })
  );
  for (const [game, version] of stored) await datasets.delete(game, version);
  log(`Removed ${keys.length} files and ${stored.length} datasets.`);
  return removed;
}

export async function pruneDownloads(options: {
  game?: string;
  keep?: string;
  yes?: boolean;
  env?: NodeJS.ProcessEnv;
}): Promise<void> {
  const config = datasetStorageConfigFromEnv(options.env ?? process.env);
  const keep = Number(options.keep ?? KEEP_PATCHES);
  if (!Number.isInteger(keep) || keep < 1) {
    throw new Error(`--keep must be a whole number of at least 1 (got "${options.keep}").`);
  }
  const removed = await prunePatches({
    games: options.game ? [parseGame(options.game)] : GAMES,
    store: createObjectStorage(config),
    datasets: createDatasetStorage(config),
    keep,
    dryRun: !options.yes
  });
  const where = describeDatasetStorage(config);
  if (Object.keys(removed).length === 0)
    console.log(`Nothing older than the newest ${keep} in ${where}.`);
  else if (!options.yes) console.log(`Nothing removed from ${where}. Pass --yes to remove these.`);
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
