#!/usr/bin/env node
import { Command } from "commander";
import { runStage } from "@exiledata/ingestion-common";
import { createBaseItemsStage } from "@exiledata/ingestion-poe2";
import { SCHEMA_VERSION, type Dataset, type DatasetMetadata } from "@exiledata/schema";
import { defaultDatasetVersion, storageFromEnv } from "./storage.js";

const program = new Command();

program.name("exiledata").description("ExileData developer/data operations CLI").version("0.0.0");

function stub(commandName: string) {
  return () => {
    console.log(`"${commandName}" is not implemented yet.`);
    process.exitCode = 1;
  };
}

interface IngestOptions {
  game: string;
  extractDir: string;
  datasetVersion?: string;
  dryRun?: boolean;
}

async function ingest(options: IngestOptions) {
  if (options.game !== "poe2") {
    console.error(`Only "poe2" ingestion is implemented (got "${options.game}").`);
    process.exitCode = 1;
    return;
  }

  const result = await runStage(createBaseItemsStage(options.extractDir));

  for (const warning of result.warnings) {
    console.warn(`[warn] ${warning}`);
  }
  for (const error of result.errors) {
    console.error(`[${error.stage}] ${error.message}`);
  }
  if (result.errors.length > 0) {
    console.error(`Ingestion failed with ${result.errors.length} error(s).`);
    process.exitCode = 1;
    return;
  }

  const gameVersion = result.metadata.sources[0]?.version;
  if (!gameVersion) {
    console.error("Extract did not report a game version.");
    process.exitCode = 1;
    return;
  }

  const metadata: DatasetMetadata = {
    game: "poe2",
    gameVersion,
    datasetVersion: options.datasetVersion ?? defaultDatasetVersion(),
    generatedAt: result.metadata.generatedAt,
    schemaVersion: SCHEMA_VERSION,
    sources: result.metadata.sources
  };
  const dataset: Dataset = { metadata, entities: result.entities };

  console.log(
    `Normalized ${result.entities.length} base items from PoE 2 ${gameVersion} ` +
      `(dataset ${metadata.datasetVersion}).`
  );

  if (options.dryRun) {
    console.log("--dry-run: nothing written.");
    return;
  }

  const { storage, description } = storageFromEnv();
  await storage.put(metadata, JSON.stringify(dataset));
  console.log(`Wrote dataset to ${description}.`);
}

program
  .command("ingest")
  .description("Run ingestion for a game and write a dataset to storage")
  .requiredOption("--game <game>", "game to ingest (only poe2 is implemented)")
  .requiredOption("--extract-dir <path>", "path to a GGPK extract directory")
  .option("--dataset-version <version>", "dataset version (default: YYYY.MM.DD.1)")
  .option("--dry-run", "run the pipeline but do not write to storage")
  .action(ingest);

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
  .command("version")
  .description("Show dataset/schema version information (not implemented)")
  .action(stub("version"));

program
  .command("inspect")
  .description("Inspect a dataset or entity (not implemented)")
  .action(stub("inspect"));

program.parse();
