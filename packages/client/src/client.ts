import { HttpClient } from "./http.js";
import { GameNamespace } from "./resources/game-namespace.js";

export interface ExileDataClientOptions {
  apiKey: string;
  /** Override the API base URL, e.g. for local development against apps/api. */
  baseUrl?: string;
}

const DEFAULT_BASE_URL = "https://api.exiledata.dev";

/**
 * ExileData SDK entrypoint.
 *
 * @example
 * ```ts
 * const client = new ExileDataClient({ apiKey: "..." });
 * const gems = await client.poe2.gems.list();
 * ```
 */
export class ExileDataClient {
  readonly poe1: GameNamespace;
  readonly poe2: GameNamespace;

  constructor(options: ExileDataClientOptions) {
    const http = new HttpClient(options.baseUrl ?? DEFAULT_BASE_URL, options.apiKey);
    this.poe1 = new GameNamespace(http, "poe1");
    this.poe2 = new GameNamespace(http, "poe2");
  }
}
