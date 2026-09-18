import { createExtractBaseItemsStage } from "@exiledata/ingestion-common";

/** PoE 1 base items from a local GGPK extract directory. */
export function createBaseItemsStage(extractDir: string, retrievedAt?: string) {
  return createExtractBaseItemsStage("poe1", extractDir, retrievedAt);
}
