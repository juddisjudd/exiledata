import type { Game, DatasetMetadata } from "@exiledata/schema";

/**
 * Generic paginated list response envelope used by list endpoints
 * (e.g. `GET /v1/{game}/items`). Placeholder — pagination strategy (cursor vs offset) not final.
 */
export interface ListResponse<T> {
  data: T[];
  meta: {
    game: Game;
    datasetVersion: string;
    total?: number;
  };
}

/** Response shape for `GET /v1/games`. */
export interface GamesResponse {
  games: Game[];
}

/** Response shape for `GET /v1/versions`. */
export interface VersionsResponse {
  datasets: DatasetMetadata[];
}
