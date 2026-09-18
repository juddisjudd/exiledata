import { createExtractBaseItemsStage } from "@exiledata/ingestion-common";

/** PoE 2 base items from a local GGPK extract directory. */
export function createBaseItemsStage(extractDir: string, retrievedAt?: string) {
  return createExtractBaseItemsStage("poe2", extractDir, retrievedAt);
}
