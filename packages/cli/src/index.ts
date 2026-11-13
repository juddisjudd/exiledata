#!/usr/bin/env node
import { Command } from "commander";
import { ingest } from "./ingest.js";
import { deleteDataset, listDatasets } from "./datasets.js";
import { listDownloads, publishDownloads } from "./downloads.js";
import { parseGames } from "./games.js";
import { patchVersion } from "./patch.js";
import { publishCurrentPatch } from "./current.js";
import { update } from "./update.js";
import { runMigrations } from "./db.js";
import { createKey, listKeys, revokeKey, setRateLimit } from "./keys.js";

const program = new Command();

program.name("exiledata").description("ExileData operations CLI").version("0.0.0");

program
  .command("ingest")
  .description("Normalize a GGPK extract and write it to dataset storage as {game}/{patch}")
  .requiredOption("--game <game>", "poe1 or poe2")
  .requiredOption("--extract-dir <path>", "path to a GGPK extract directory")
  .option("--dry-run", "run the pipeline but do not write to storage")
  .option("--overwrite", "replace an existing dataset for the same patch")
  .action(async (options) => {
    await ingest(options);
  });

const datasets = program.command("datasets").description("Inspect and manage dataset storage");

datasets
  .command("list")
  .description("List published datasets")
  .option("--game <game>", "only this game")
  .action(listDatasets);

datasets
  .command("delete")
  .description("Delete one published dataset")
  .requiredOption("--game <game>", "poe1 or poe2")
  .requiredOption("--patch <version>", "game patch, e.g. 0.5.5.4")
  .option("--yes", "confirm the deletion")
  .action(deleteDataset);

const downloads = program
  .command("downloads")
  .description("Publish and list the public download files (data.exiledata.dev)");

downloads
  .command("publish")
  .description("Publish an extract's JSON files, the normalized records, a manifest and a zip")
  .requiredOption("--game <game>", "poe1 or poe2")
  .requiredOption("--extract-dir <path>", "path to a GGPK extract directory")
  .option("--overwrite", "replace a patch that is already published")
  .option("--dry-run", "build everything but upload nothing")
  .action(async (options) => {
    await publishDownloads(options);
  });

downloads
  .command("list")
  .description("List published download patches")
  .action(() => listDownloads());

program
  .command("patch")
  .description("Print each game's current patch, as GGG's patch servers report it")
  .argument("[games...]", "poe1 and/or poe2 (default: both)")
  .option("--publish", "also publish downloads/current.json (data.exiledata.dev)")
  .action(async (games: string[], options) => {
    if (options.publish) {
      await publishCurrentPatch({ games });
      return;
    }
    for (const game of parseGames(games)) console.log(`${game} ${await patchVersion(game)}`);
  });

program
  .command("update")
  .description("Export, ingest and publish each game whose current patch is not published yet")
  .argument("[games...]", "poe1 and/or poe2 (default: both)")
  .option("--check", "only report which games are behind")
  .option("--force", "rebuild and republish even if the patch is already published")
  .option("--work-dir <dir>", "where ggpk-explorer writes the extracts and its log", "work")
  .option("--dry-run", "export and build everything but write nothing to storage")
  .action(async (games: string[], options) => {
    await update({ ...options, games });
  });

program
  .command("db")
  .description("Database operations")
  .command("migrate")
  .description("Apply pending migrations from migrations/ to DATABASE_URL")
  .option("--dir <path>", "migrations directory", "migrations")
  .option("--baseline <file>", "mark migrations up to this file as applied without running them")
  .action(runMigrations);

const keys = program
  .command("keys")
  .description("Manage API keys through the admin API (needs ADMIN_TOKEN)")
  .option(
    "--api-url <url>",
    "API base URL (default: EXILEDATA_API_URL or https://api.exiledata.dev)"
  );

keys
  .command("list")
  .description("List keys with recent usage")
  .action((_options, command: Command) => listKeys(command.optsWithGlobals()));

keys
  .command("create")
  .description("Issue a key, creating the client if needed")
  .requiredOption("--client <name>", "who the key is for")
  .option("--rate-limit <n>", "requests per minute (default: server default)")
  .action((_options, command: Command) => createKey(command.optsWithGlobals()));

keys
  .command("revoke <id>")
  .description("Revoke a key")
  .action((id: string, _options, command: Command) =>
    revokeKey({ ...command.optsWithGlobals(), id })
  );

keys
  .command("limit <id> <requestsPerMinute>")
  .description("Change a key's rate limit")
  .action((id: string, limit: string, _options, command: Command) =>
    setRateLimit({ ...command.optsWithGlobals(), id, limit })
  );

program.parseAsync().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
