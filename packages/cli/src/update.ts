import { spawn as spawnProcess } from "node:child_process";
import { appendFile, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
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
export type Spawn = (command: string, args: string[]) => Promise<SpawnResult>;

const run: Spawn = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawnProcess(command, args, { stdio: ["ignore", "pipe", "pipe"] });
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

async function explorer(spawn: Spawn, bin: string, args: string[], logFile: string) {
  const { code, stdout, stderr } = await spawn(bin, args);
  await appendFile(logFile, `$ ggpk-explorer ${args.join(" ")}\n${stdout}${stderr}`);
  if (code !== 0) {
    throw new Error(
      `ggpk-explorer ${args[0]} exited with ${code}\n${tail(stderr)}\n${tail(stdout)}`.trimEnd()
    );
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
}

/**
 * Brings the downloads up to each game's current patch. Asks the patch servers which patch is
 * current, compares it with `downloads/index.json`, and for each game that is behind exports
 * the patch from the CDN with ggpk-explorer, ingests it and publishes it. Returns the games that
 * were behind (all of them with `force`).
 */
export async function update(options: UpdateOptions = {}): Promise<Game[]> {
  const log = options.log ?? console.log;
  const env = options.env ?? process.env;
  const config = datasetStorageConfigFromEnv(env);
  const store = options.store ?? createObjectStorage(config);
  const currentPatch = options.currentPatch ?? patchVersion;
  const index = await readJson<DownloadIndex>(store, `${DOWNLOADS_PREFIX}/index.json`);

  const stale: Array<{ game: Game; patch: string }> = [];
  for (const game of parseGames(options.games)) {
    const patch = await currentPatch(game);
    const published = index?.games[game]?.latest;
    log(`${game}: patch ${patch}, published ${published ?? "none"}`);
    if (options.force || published !== patch) stale.push({ game, patch });
  }
  const games = stale.map((s) => s.game);

  if (options.check) {
    if (env.GITHUB_OUTPUT) await appendFile(env.GITHUB_OUTPUT, `stale=${games.join(" ")}\n`);
    return games;
  }
  if (stale.length === 0) log("Nothing to update.");

  const workDir = path.resolve(options.workDir ?? "work");
  const spawn = options.spawn ?? run;
  const bin = env.GGPK_EXPLORER || "ggpk-explorer";
  const schema = env.DAT_SCHEMA ? ["--schema", env.DAT_SCHEMA] : [];
  const datasets = createDatasetStorage(config);
  const failed: string[] = [];

  for (const { game, patch } of stale) {
    try {
      const out = path.join(workDir, game);
      const extractDir = path.join(out, `${patch}-stripped`);
      const logFile = path.join(out, `${patch}.log`);
      await rm(extractDir, { recursive: true, force: true });
      await mkdir(out, { recursive: true });

      const started = Date.now();
      // The hand-made extracts' options, less --images: the art is not published.
      await explorer(
        spawn,
        bin,
        [
          "export-data",
          "--cdn",
          patch,
          `--${game}`,
          "--trade-stats",
          "--strip-null",
          "-o",
          out,
          ...schema
        ],
        logFile
      );
      await explorer(
        spawn,
        bin,
        [
          "export-tree",
          "--cdn",
          patch,
          `--${game}`,
          "--flat",
          "-o",
          path.join(extractDir, "pob_tree"),
          ...schema
        ],
        logFile
      );
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
    } catch (error) {
      log(`${game}: update failed: ${(error as Error).message}`);
      failed.push(game);
    }
  }

  if (failed.length > 0) throw new Error(`Update failed for ${failed.join(", ")}.`);
  return games;
}
