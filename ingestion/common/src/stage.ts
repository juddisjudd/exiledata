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
  /**
   * Optional hook for non-fatal notes about the parsed data — most usefully, upstream records
   * the stage chose to exclude. Without this, a stage that drops input does so silently.
   */
  warn?(parsed: TParsed): string[];
}

export interface IngestionRunResult<TEntity> {
  entities: TEntity[];
  errors: IngestionError[];
  /** Non-fatal notes from the stage, e.g. upstream records excluded before normalization. */
  warnings: string[];
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
