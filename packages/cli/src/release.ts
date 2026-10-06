import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { zipSync, type Zippable } from "fflate";
import { compareGameVersions } from "@exiledata/storage";
import type { Game } from "@exiledata/schema";
import {
  FILE_DESCRIPTIONS,
  FOLDER_DESCRIPTIONS,
  NORMALIZED_DESCRIPTIONS
} from "./file-descriptions.js";

/** Extract folders that hold JSON worth publishing. `Art/` (images) is left out for now. */
const FOLDERS = ["base_items", "passive_skill_trees", "stat_translations"];
/** The extractor's own run report, not game data. */
const SKIPPED = new Set(["export_report"]);
/**
 * Path of Building's `src/TreeData`, one folder per tree, published file for file. The exporter's
 * own files (version.txt, its report) sit at the folder's root and are left out.
 */
const POB_TREE = "pob_tree";
const TREE_VERSION = /^\d+_\d+(_[a-z]+)*$/;
/** Already compressed, so the tree zips store them as they are. */
const STORED = new Set([".png", ".jpg", ".jpeg", ".webp", ".zst", ".zip"]);

export interface FileVariant {
  path: string;
  bytes: number;
  sha256: string;
}

/**
 * One logical file. JSON is published pretty-printed (`path`) and minified (`min`) with a record
 * count; `pob_tree/` files are published once, as they are, and have neither.
 */
export interface ManifestFile extends FileVariant {
  kind: "raw" | "normalized";
  folder: string | null;
  records?: number;
  description?: string;
  min?: FileVariant;
}

/** One PoB tree folder, zipped as `{version}/...` for dropping into `src/TreeData`. */
export interface ManifestTree {
  version: string;
  archive: FileVariant;
}

export interface Manifest {
  game: Game;
  gameVersion: string;
  generatedAt: string;
  schemaVersion: string;
  archive: FileVariant;
  trees?: ManifestTree[];
  folders: Record<string, string>;
  files: ManifestFile[];
}

export interface IndexEntry {
  gameVersion: string;
  generatedAt: string;
  files: number;
  bytes: number;
  archive: FileVariant;
}

export interface DownloadIndex {
  updatedAt: string;
  games: Partial<Record<Game, { latest: string; versions: IndexEntry[] }>>;
}

export interface Release {
  manifest: Manifest;
  /** Every object to upload, keyed by path relative to the patch folder. */
  objects: Map<string, Uint8Array>;
}

const sha256 = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");
const variant = (filePath: string, data: Uint8Array): FileVariant => ({
  path: filePath,
  bytes: data.byteLength,
  sha256: sha256(data)
});

function countRecords(data: Uint8Array): number {
  const value: unknown = JSON.parse(Buffer.from(data).toString("utf8"));
  if (Array.isArray(value)) return value.length;
  return value && typeof value === "object" ? Object.keys(value).length : 0;
}

/** Pretty/minified pairs in one directory, keyed by base name. */
function pairsIn(names: string[]): string[] {
  return names
    .filter((n) => n.endsWith(".min.json"))
    .map((n) => n.slice(0, -".min.json".length))
    .filter((base) => names.includes(`${base}.json`) && !SKIPPED.has(base))
    .sort();
}

/**
 * Every pair under `dir` as `[relative directory, base name]`. Recurses only when asked: the
 * extract's top level holds folders (Art) that are deliberately left out.
 */
async function walkPairs(
  dir: string,
  relDir: string,
  recurse: boolean
): Promise<Array<[string, string]>> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const files = entries.filter((e) => e.isFile()).map((e) => e.name);
  const pairs: Array<[string, string]> = pairsIn(files).map((base) => [relDir, base]);
  if (!recurse) return pairs;

  const subdirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  for (const sub of subdirs) {
    pairs.push(...(await walkPairs(path.join(dir, sub), `${relDir}/${sub}`, true)));
  }
  return pairs;
}

/** Every file under `dir`, as sorted `/`-separated paths relative to it. */
async function walkFiles(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true, recursive: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return entries
    .filter((e) => e.isFile())
    .map((e) => path.relative(dir, path.join(e.parentPath, e.name)).split(path.sep).join("/"))
    .sort();
}

/**
 * Builds one patch's download: the extract's JSON files as they are, the normalized records,
 * Path of Building's tree files, a manifest with sizes, checksums and record counts, a zip of
 * every minified file, and a zip per tree.
 */
export async function buildRelease(options: {
  game: Game;
  extractDir: string;
  gameVersion: string;
  schemaVersion: string;
  normalized: Record<string, unknown[]>;
  now?: Date;
}): Promise<Release> {
  const { game, extractDir, gameVersion } = options;
  const objects = new Map<string, Uint8Array>();
  const files: ManifestFile[] = [];

  const addPair = (
    kind: ManifestFile["kind"],
    folder: string | null,
    relDir: string,
    base: string,
    pretty: Uint8Array,
    min: Uint8Array,
    description: string | undefined
  ) => {
    const prefix = relDir ? `${relDir}/` : "";
    const prettyPath = `${prefix}${base}.json`;
    const minPath = `${prefix}${base}.min.json`;
    objects.set(prettyPath, pretty);
    objects.set(minPath, min);
    files.push({
      kind,
      folder,
      ...variant(prettyPath, pretty),
      min: variant(minPath, min),
      records: countRecords(min),
      ...(description ? { description } : {})
    });
  };

  for (const [base, records] of Object.entries(options.normalized)) {
    const pretty = Buffer.from(JSON.stringify(records, null, 2) + "\n");
    const min = Buffer.from(JSON.stringify(records));
    addPair(
      "normalized",
      "normalized",
      "normalized",
      base,
      pretty,
      min,
      NORMALIZED_DESCRIPTIONS[base]
    );
  }

  for (const folder of [null, ...FOLDERS]) {
    const pairs = folder
      ? await walkPairs(path.join(extractDir, folder), folder, true)
      : await walkPairs(extractDir, "", false);
    for (const [relDir, base] of pairs) {
      const dir = path.join(extractDir, ...relDir.split("/").filter(Boolean));
      const [pretty, min] = await Promise.all([
        readFile(path.join(dir, `${base}.json`)),
        readFile(path.join(dir, `${base}.min.json`))
      ]);
      addPair(
        "raw",
        folder,
        relDir,
        base,
        pretty,
        min,
        folder ? undefined : FILE_DESCRIPTIONS[base]
      );
    }
  }

  const treeFiles = new Map<string, Zippable>();
  for (const rel of await walkFiles(path.join(extractDir, POB_TREE))) {
    const [version = "", ...rest] = rel.split("/");
    if (rest.length === 0 || !TREE_VERSION.test(version)) continue;
    const filePath = `${POB_TREE}/${rel}`;
    const data = await readFile(path.join(extractDir, POB_TREE, ...rel.split("/")));
    objects.set(filePath, data);
    files.push({ kind: "raw", folder: POB_TREE, ...variant(filePath, data) });

    const entries = treeFiles.get(version) ?? {};
    entries[rel] = [data, { level: STORED.has(path.extname(rel).toLowerCase()) ? 0 : 6 }];
    treeFiles.set(version, entries);
  }

  const root = `${game}-${gameVersion}`;
  const zipped = zipSync(
    Object.fromEntries(
      files.flatMap((f) => (f.min ? [[`${root}/${f.min.path}`, objects.get(f.min.path)!]] : []))
    ),
    { level: 6 }
  );
  const archivePath = `${root}.zip`;
  objects.set(archivePath, zipped);

  const trees = [...treeFiles].map(([version, entries]): ManifestTree => {
    const treePath = `${root}-pob-tree-${version}.zip`;
    const data = zipSync(entries);
    objects.set(treePath, data);
    return { version, archive: variant(treePath, data) };
  });

  const manifest: Manifest = {
    game,
    gameVersion,
    generatedAt: (options.now ?? new Date()).toISOString(),
    schemaVersion: options.schemaVersion,
    archive: variant(archivePath, zipped),
    trees,
    folders: Object.fromEntries(
      [...new Set(files.map((f) => f.folder).filter((f): f is string => f !== null))].map((f) => [
        f,
        FOLDER_DESCRIPTIONS[f] ?? ""
      ])
    ),
    files
  };
  return { manifest, objects };
}

/** Adds or replaces one patch in the index; "latest" is the highest patch, compared numerically. */
export function mergeIndex(
  index: DownloadIndex | undefined,
  manifest: Manifest,
  now = new Date()
): DownloadIndex {
  const games = { ...(index?.games ?? {}) };
  const entry: IndexEntry = {
    gameVersion: manifest.gameVersion,
    generatedAt: manifest.generatedAt,
    files: manifest.files.length,
    bytes: manifest.files.reduce((sum, f) => sum + f.bytes + (f.min?.bytes ?? 0), 0),
    archive: manifest.archive
  };
  const versions = [
    ...(games[manifest.game]?.versions ?? []).filter((v) => v.gameVersion !== manifest.gameVersion),
    entry
  ].sort((a, b) => compareGameVersions(manifest.game, b.gameVersion, a.gameVersion));

  games[manifest.game] = { latest: versions[0]!.gameVersion, versions };
  return { updatedAt: now.toISOString(), games };
}
