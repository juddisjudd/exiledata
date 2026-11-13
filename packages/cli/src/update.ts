import { spawn as spawnProcess } from "node:child_process";
import { appendFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { unzipSync, zipSync } from "fflate";
import {
  createDatasetStorage,
  createObjectStorage,
  datasetStorageConfigFromEnv,
  describeDatasetStorage,
  type ObjectStorage
} from "@exiledata/storage";
import type { Dataset, Game } from "@exiledata/schema";
import { DOWNLOADS_PREFIX, publishDownloads, readJson } from "./downloads.js";
import { parseGames } from "./games.js";
import { ingest } from "./ingest.js";
import { patchVersion } from "./patch.js";
import type { DownloadIndex } from "./release.js";

export interface SpawnResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Runs a program to the end and returns its exit code and output. */
export type Spawn = (
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv
) => Promise<SpawnResult>;

const run: Spawn = (command, args, env) =>
  new Promise((resolve, reject) => {
    const child = spawnProcess(command, args, { stdio: ["ignore", "pipe", "pipe"], env });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk));
    child.on("error", (error) =>
      reject(
        new Error(`Could not run ${command} (set GGPK_EXPLORER to its path): ${error.message}`)
      )
    );
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });

const tail = (text: string, lines = 20) => text.trimEnd().split("\n").slice(-lines).join("\n");

/** Kept to re-fit the next patch against, since GGG's CDN drops a patch once the next ships. */
export const TABLES_PREFIX = "refit";
const tablesKey = (game: Game, patch: string, file: string) =>
  `${TABLES_PREFIX}/${game}/${patch}/${file}`;

/** What the Downloads page says about a game whose newest patch is not published. */
export const STATUS_KEY = `${DOWNLOADS_PREFIX}/status.json`;

export interface GameStatus {
  /** `waiting`: the patch moved tables and dat-schema has not caught up. `failed`: anything else. */
  state: "waiting" | "failed";
  patch: string;
  /** The newest patch that is published, which the downloads still serve. */
  published: string | null;
  /** When this patch first failed to publish. */
  since: string;
  /** The tables whose layout the patch changed, for `waiting`. */
  tables?: string[];
}

export interface DownloadStatus {
  updatedAt: string;
  games: Partial<Record<Game, GameStatus>>;
}

/** Report statuses meaning a table's layout no longer matches the schema. */
const DRIFT = new Set(["refused", "skipped"]);

interface ExportReport {
  modules_failed?: Record<string, unknown>;
  tables?: Array<{ table: string; status: string }>;
}

/** The patch changed tables the schema no longer reads, and nothing could re-fit them. */
class SchemaDrift extends Error {
  constructor(readonly tables: string[]) {
    super(`the patch changed the layout of ${tables.join(", ")}`);
  }
}

export interface UpdateOptions {
  games?: string[];
  check?: boolean;
  force?: boolean;
  workDir?: string;
  dryRun?: boolean;
  store?: ObjectStorage;
  env?: NodeJS.ProcessEnv;
  log?: (line: string) => void;
  currentPatch?: (game: Game) => Promise<string>;
  spawn?: Spawn;
  now?: () => Date;
}

export async function update(options: UpdateOptions = {}): Promise<Game[]> {
  const log = options.log ?? console.log;
  const env = options.env ?? process.env;
  const now = options.now ?? (() => new Date());
  const config = datasetStorageConfigFromEnv(env);
  const store = options.store ?? createObjectStorage(config);
  const currentPatch = options.currentPatch ?? patchVersion;
  const index = await readJson<DownloadIndex>(store, `${DOWNLOADS_PREFIX}/index.json`);

  const work: Array<{ game: Game; patch: string; published: string | null; archiveOnly: boolean }> =
    [];
  for (const game of parseGames(options.games)) {
    const patch = await currentPatch(game);
    const published = index?.games[game]?.latest ?? null;
    const behind = options.force || published !== patch;
    const archived =
      behind || (await store.get(tablesKey(game, patch, "tables.json"))) !== undefined;
    log(
      `${game}: patch ${patch}, published ${published ?? "none"}` +
        (archived ? "" : ", tables not saved")
    );
    if (behind || !archived) work.push({ game, patch, published, archiveOnly: !behind });
  }
  const games = work.map((w) => w.game);

  if (options.check) {
    if (env.GITHUB_OUTPUT) await appendFile(env.GITHUB_OUTPUT, `stale=${games.join(" ")}\n`);
    return games;
  }
  if (work.length === 0) log("Nothing to update.");

  const workDir = path.resolve(options.workDir ?? "work");
  const spawn = options.spawn ?? run;
  const bin = env.GGPK_EXPLORER || "ggpk-explorer";
  const schema = env.DAT_SCHEMA ? ["--schema", env.DAT_SCHEMA] : [];
  const datasets = createDatasetStorage(config);
  const failed: string[] = [];

  for (const { game, patch, published, archiveOnly } of work) {
    const out = path.join(workDir, game);
    const extractDir = path.join(out, `${patch}-stripped`);
    const logFile = path.join(out, `${patch}.log`);
    // Each game keeps its re-fitted layouts to itself; a shared table re-fitted for one game
    // would otherwise replace the other game's definition.
    const overrides = path.join(out, "schema_overrides.json");
    const gameEnv = { ...env, GGPK_EXPLORER_OVERRIDES: overrides };
    await mkdir(out, { recursive: true });
    await rm(overrides, { force: true });

    const explorer = async (args: string[]) => {
      const result = await spawn(bin, [...args, ...schema], gameEnv);
      await appendFile(
        logFile,
        `$ ggpk-explorer ${args.join(" ")}\n${result.stdout}${result.stderr}`
      );
      return result;
    };
    const failure = (args: string[], result: SpawnResult) =>
      `ggpk-explorer ${args[0]} exited with ${result.code}\n${tail(result.stderr)}\n${tail(result.stdout)}`.trimEnd();

    const saveTables = async () => {
      const dir = path.join(out, `${patch}-tables`);
      await rm(dir, { recursive: true, force: true });
      const args = ["refit", "--cdn", patch, `--${game}`, "--save", dir];
      const result = await explorer(args);
      if (result.code !== 0) throw new Error(failure(args, result));
      const names = (await readdir(dir)).sort();
      const files = Object.fromEntries(
        await Promise.all(names.map(async (n) => [n, await readFile(path.join(dir, n))] as const))
      );
      if (options.dryRun) return;
      const json = { contentType: "application/json; charset=utf-8" };
      await store.put(tablesKey(game, patch, "tables.zip"), zipSync(files, { level: 6 }), {
        contentType: "application/zip"
      });
      const layouts = await readFile(overrides).catch(() => undefined);
      if (layouts) await store.put(tablesKey(game, patch, "schema_overrides.json"), layouts, json);
      const marker = { patch, tables: names.length, savedAt: now().toISOString() };
      await store.put(tablesKey(game, patch, "tables.json"), JSON.stringify(marker), json);
      log(`${game}: saved ${names.length} tables of ${patch} to re-fit the next patch against`);
    };

    /** Throws `SchemaDrift` when there is nothing to re-fit from or a table does not fit. */
    const refit = async (tables: string[]) => {
      if (!published || published === patch) throw new SchemaDrift(tables);
      const saved = await store.get(tablesKey(game, published, "tables.zip"));
      if (!saved) {
        log(`${game}: no saved tables of ${published} to re-fit against`);
        throw new SchemaDrift(tables);
      }
      const dir = path.join(out, `${published}-tables`);
      await rm(dir, { recursive: true, force: true });
      await mkdir(dir, { recursive: true });
      for (const [name, data] of Object.entries(unzipSync(saved))) {
        await writeFile(path.join(dir, name), data);
      }
      const earlier = await readJson<{ tables?: Array<{ name: string }> }>(
        store,
        tablesKey(game, published, "schema_overrides.json")
      );
      const wanted = new Set(tables.map((t) => t.toLowerCase()));
      const kept = (earlier?.tables ?? []).filter((t) => wanted.has(t.name.toLowerCase()));
      if (earlier && kept.length > 0) {
        await writeFile(overrides, JSON.stringify({ ...earlier, tables: kept }));
      }
      const args = [
        "refit",
        "--cdn",
        patch,
        `--${game}`,
        "--old",
        published,
        "--old-dir",
        dir,
        "--table",
        tables.join(","),
        "--write",
        "--strict"
      ];
      const result = await explorer(args);
      if (result.code !== 0) {
        log(`${game}: ${failure(args, result)}`);
        throw new SchemaDrift(tables);
      }
    };

    try {
      if (archiveOnly) {
        await saveTables();
        continue;
      }
      await rm(extractDir, { recursive: true, force: true });
      const started = Date.now();

      /** Both exports, and what their reports say the patch broke. */
      const exportPatch = async () => {
        const runs: Array<[string[], string]> = [
          [
            [
              "export-data",
              "--cdn",
              patch,
              `--${game}`,
              "--trade-stats",
              "--strip-null",
              "-o",
              out
            ],
            path.join(extractDir, "export_report.json")
          ],
          [
            [
              "export-tree",
              "--cdn",
              patch,
              `--${game}`,
              "--flat",
              "-o",
              path.join(extractDir, "pob_tree")
            ],
            path.join(extractDir, "pob_tree", "export_report.json")
          ]
        ];
        const drift = new Set<string>();
        const failures: string[] = [];
        for (const [args, reportFile] of runs) {
          const result = await explorer(args);
          const report = await readFile(reportFile, "utf8")
            .then((text) => JSON.parse(text) as ExportReport)
            .catch(() => undefined);
          for (const t of report?.tables ?? []) if (DRIFT.has(t.status)) drift.add(t.table);
          if (result.code !== 0) failures.push(failure(args, result));
        }
        return { drift: [...drift].sort(), failures };
      };

      let outcome = await exportPatch();
      if (outcome.drift.length > 0) {
        log(`${game}: ${patch} changed the layout of ${outcome.drift.join(", ")}; re-fitting`);
        await refit(outcome.drift);
        outcome = await exportPatch();
        if (outcome.drift.length > 0) throw new SchemaDrift(outcome.drift);
        log(`${game}: re-fitted ${patch} against ${published}`);
      }
      if (outcome.failures.length > 0) throw new Error(outcome.failures.join("\n"));
      log(
        `${game}: exported ${patch} in ${Math.round((Date.now() - started) / 1000)}s, ` +
          `log in ${logFile}`
      );

      const exported = (await readFile(path.join(extractDir, "version.txt"), "utf8")).trim();
      if (exported !== patch) throw new Error(`asked for ${patch}, but the export is ${exported}`);

      let dataset: Dataset | undefined;
      const ingested = (await datasets.list(game)).some((d) => d.gameVersion === patch);
      if (ingested && !options.force) {
        log(`${game}: ${patch} is already in ${describeDatasetStorage(config)}; keeping it.`);
      } else {
        dataset = await ingest({
          game,
          extractDir,
          overwrite: options.force,
          dryRun: options.dryRun,
          env,
          log
        });
      }

      await publishDownloads({
        game,
        extractDir,
        overwrite: options.force,
        dryRun: options.dryRun,
        dataset,
        store,
        env,
        log
      });
      if (!options.dryRun) await setStatus(store, game, undefined, now);

      try {
        await saveTables();
      } catch (error) {
        log(`${game}: published, but the tables were not saved: ${(error as Error).message}`);
      }
    } catch (error) {
      log(`${game}: update failed: ${(error as Error).message}`);
      failed.push(game);
      if (!options.dryRun && !archiveOnly && published !== patch) {
        const drift = error instanceof SchemaDrift ? error.tables : undefined;
        await setStatus(
          store,
          game,
          { state: drift ? "waiting" : "failed", patch, published, tables: drift },
          now
        );
      }
    }
  }

  if (failed.length > 0) throw new Error(`Update failed for ${failed.join(", ")}.`);
  return games;
}

/** A patch that keeps failing keeps the time it first failed. */
async function setStatus(
  store: ObjectStorage,
  game: Game,
  entry: Omit<GameStatus, "since"> | undefined,
  now: () => Date
) {
  const status = (await readJson<DownloadStatus>(store, STATUS_KEY)) ?? {
    updatedAt: "",
    games: {}
  };
  const previous = status.games[game];
  if (!entry && !previous) return;
  if (entry) {
    const since = previous?.patch === entry.patch ? previous.since : now().toISOString();
    status.games[game] = { ...entry, since };
  } else {
    delete status.games[game];
  }
  status.updatedAt = now().toISOString();
  await store.put(STATUS_KEY, JSON.stringify(status), {
    contentType: "application/json; charset=utf-8",
    cacheControl: "public, max-age=60"
  });
}
