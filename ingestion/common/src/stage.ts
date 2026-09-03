import type { DatasetMetadata } from "@exiledata/schema";
import type { IngestionSource } from "./source.js";
import type { Normalizer, Parser, Validator } from "./pipeline.js";

/**
 * Ties together source -> parser -> normalizer -> validator for a single entity type, and
 * produces a dataset-ready result. Orchestration (running multiple stages, error aggregation,
 * dataset assembly) is left to future implementation — this defines the shape only.
 */
export interface IngestionStage<TRaw, TParsed, TEntity> {
  source: IngestionSource<TRaw>;
  parser: Parser<TRaw, TParsed>;
  normalizer: Normalizer<TParsed, TEntity>;
  validator: Validator<TEntity>;
}

export interface IngestionRunResult<TEntity> {
  entities: TEntity[];
  errors: IngestionError[];
  metadata: Pick<DatasetMetadata, "sources" | "generatedAt">;
}

/**
 * Structured error reporting for ingestion failures (network, parse, validation). Kept generic
 * so the CLI/API can surface consistent error information regardless of stage.
 */
export interface IngestionError {
  stage: "fetch" | "parse" | "normalize" | "validate";
  message: string;
  cause?: unknown;
}
