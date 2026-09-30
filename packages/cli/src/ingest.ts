import {
  createDatasetStorage,
  datasetStorageConfigFromEnv,
  describeDatasetStorage,
  runStage
} from "@exiledata/ingestion-common";
import { createBaseItemsStage as createPoe1BaseItemsStage } from "@exiledata/ingestion-poe1";
import { createBaseItemsStage as createPoe2BaseItemsStage } from "@exiledata/ingestion-poe2";
import { SCHEMA_VERSION, type Dataset, type DatasetMetadata } from "@exiledata/schema";
import { parseGame } from "./games.js";

export interface IngestOptions {
  game: string;
  extractDir: string;
  dryRun?: boolean;
  overwrite?: boolean;
  env?: NodeJS.ProcessEnv;
  log?: (line: string) => void;
}

const STAGES = { poe1: createPoe1BaseItemsStage, poe2: createPoe2BaseItemsStage };

/** Runs the base-item stage against an extract and writes one dataset per game patch. */
export async function ingest(options: IngestOptions): Promise<Dataset> {
  const log = options.log ?? console.log;
  const game = parseGame(options.game);
  const result = await runStage(STAGES[game](options.extractDir));

  for (const warning of result.warnings) console.warn(`[warn] ${warning}`);
  for (const error of result.errors) console.error(`[${error.stage}] ${error.message}`);
  if (result.errors.length > 0) {
    throw new Error(`Ingestion failed with ${result.errors.length} error(s).`);
  }

  const gameVersion = result.metadata.sources[0]?.version;
  if (!gameVersion) throw new Error("Extract did not report a game version.");

  const metadata: DatasetMetadata = {
    game,
    gameVersion,
    generatedAt: result.metadata.generatedAt,
    schemaVersion: SCHEMA_VERSION,
    sources: result.metadata.sources
  };
  const dataset: Dataset = { metadata, entities: result.entities };

  log(`Normalized ${result.entities.length} base items from ${game} ${gameVersion}.`);
  if (options.dryRun) {
    log("--dry-run: nothing written.");
    return dataset;
  }

  const config = datasetStorageConfigFromEnv(options.env ?? process.env);
  const storage = createDatasetStorage(config);
  const exists = (await storage.list(game)).some((d) => d.gameVersion === gameVersion);
  if (exists && !options.overwrite) {
    throw new Error(
      `${game}/${gameVersion} already exists in ${describeDatasetStorage(config)}. ` +
        "Pass --overwrite to replace it."
    );
  }

  await storage.put(metadata, JSON.stringify(dataset));
  log(
    `${exists ? "Replaced" : "Wrote"} ${game}/${gameVersion} in ${describeDatasetStorage(config)}.`
  );
  return dataset;
}
