import type { Game } from "@exiledata/schema";

export interface IngestionSource<TRaw = unknown> {
  /** Recorded as `SourceProvenance.name`, e.g. "poe2-ggpk-extract". */
  name: string;
  game: Game;
  fetch(): Promise<TRaw>;
  getVersion?(raw: TRaw): string | undefined;
}
