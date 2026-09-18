#!/usr/bin/env node
import { Command } from "commander";
import { ingest } from "./ingest.js";
import { deleteDataset, listDatasets } from "./datasets.js";
import { runMigrations } from "./db.js";
import { createKey, listKeys, revokeKey, setRateLimit } from "./keys.js";

const program = new Command();

program.name("exiledata").description("ExileData developer/data operations CLI").version("0.0.0");

function stub(commandName: string) {
  return () => {
    console.log(`"${commandName}" is not implemented yet.`);
    process.exitCode = 1;
  };
}

program
  .command("ingest")
  .description("Normalize a GGPK extract and write it to dataset storage as {game}/{patch}")
  .requiredOption("--game <game>", "poe1 or poe2")
  .requiredOption("--extract-dir <path>", "path to a GGPK extract directory")
  .option("--dry-run", "run the pipeline but do not write to storage")
  .option("--overwrite", "replace an existing dataset for the same patch")
  .action(ingest);

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
  .requiredOption("--patch <version>", "game patch, e.g. 4.5.5.3")
  .option("--yes", "confirm the deletion")
  .action(deleteDataset);

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

program
  .command("validate")
  .description("Validate normalized entities against the canonical schema (not implemented)")
  .action(stub("validate"));

program
  .command("build")
  .description("Build a dataset from validated entities (not implemented)")
  .action(stub("build"));

program
  .command("diff")
  .description("Compare two dataset versions (not implemented)")
  .action(stub("diff"));

program
  .command("inspect")
  .description("Inspect a dataset or entity (not implemented)")
  .action(stub("inspect"));

program.parseAsync().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
