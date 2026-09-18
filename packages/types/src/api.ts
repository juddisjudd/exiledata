import type { Game, DatasetMetadata } from "@exiledata/schema";

/**
 * Generic paginated list response envelope used by list endpoints
 * (e.g. `GET /v1/{game}/bases`). `meta.gameVersion` is the patch the data was read from, so a
 * client that did not ask for a version can pin to the one it got.
 */
export interface ListResponse<T> {
  data: T[];
  meta: {
    game: Game;
    gameVersion: string;
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

/** Error body returned by every non-2xx response. */
export interface ErrorResponse {
  error: string;
  message: string;
}
