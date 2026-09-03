import type { IngestionSource } from "@exiledata/ingestion-common";

/**
 * Placeholder RePoE source for PoE 1. Not yet implemented — establishes where a future
 * `fetch()` implementation would live (e.g. downloading RePoE's published JSON data).
 */
export const repoeSource: IngestionSource<unknown> = {
  name: "repoe",
  game: "poe1",
  async fetch() {
    throw new Error("not implemented: ingestion/poe1 repoe source");
  }
};
