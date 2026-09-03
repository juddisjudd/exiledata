import type { IngestionSource } from "@exiledata/ingestion-common";

/**
 * Placeholder PoEDB source for PoE 2. Not yet implemented — establishes where a future
 * `fetch()` implementation would live. Note: must never be scraped at API request/startup time,
 * only via an offline/scheduled ingestion run (see root README constraints).
 */
export const poedbSource: IngestionSource<unknown> = {
  name: "poedb",
  game: "poe2",
  async fetch() {
    throw new Error("not implemented: ingestion/poe2 poedb source");
  }
};
