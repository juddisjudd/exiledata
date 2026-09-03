import type { Game } from "@exiledata/schema";

/**
 * Describes an upstream data source (e.g. RePoE, PoEDB). Implementations live in
 * ingestion/poe1 and ingestion/poe2 — this package only defines the contract.
 */
export interface IngestionSource<TRaw = unknown> {
  /** Stable identifier, e.g. "repoe". Matches `SourceProvenance.name` in the schema. */
  name: string;
  game: Game;
  /** Fetches raw upstream data. No parsing/normalization happens here. */
  fetch(): Promise<TRaw>;
  /** Version/commit/snapshot identifier for the fetched data, if determinable. */
  getVersion?(raw: TRaw): string | undefined;
}
