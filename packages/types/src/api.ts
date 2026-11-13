import type { Game, DatasetMetadata } from "@exiledata/schema";

/** `meta.gameVersion` is the patch that answered, so a client can pin to it. */
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
