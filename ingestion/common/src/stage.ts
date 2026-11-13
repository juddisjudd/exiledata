import type { DatasetMetadata } from "@exiledata/schema";
import type { IngestionSource } from "./source.js";
import type { Normalizer, Parser, Validator } from "./pipeline.js";

export interface IngestionStage<TRaw, TParsed, TEntity> {
  source: IngestionSource<TRaw>;
  parser: Parser<TRaw, TParsed>;
  normalizer: Normalizer<TParsed, TEntity>;
  validator: Validator<TEntity>;
  /** Notes about records the stage excludes, so dropped input is never silent. */
  warn?(parsed: TParsed): string[];
}

export interface IngestionRunResult<TEntity> {
  entities: TEntity[];
  errors: IngestionError[];
  /** Non-fatal notes from the stage, e.g. upstream records excluded before normalization. */
  warnings: string[];
  metadata: Pick<DatasetMetadata, "sources" | "generatedAt">;
}

export interface IngestionError {
  stage: "fetch" | "parse" | "normalize" | "validate";
  message: string;
  cause?: unknown;
}
