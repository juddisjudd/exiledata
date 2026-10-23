import {
  createObjectStorage,
  datasetStorageConfigFromEnv,
  type ObjectStorage
} from "@exiledata/storage";
import type { Game } from "@exiledata/schema";
import { DOWNLOADS_PREFIX, readJson } from "./downloads.js";
import { parseGames } from "./games.js";
import { patchVersion } from "./patch.js";

export const CURRENT_KEY = `${DOWNLOADS_PREFIX}/current.json`;

export interface CurrentPatch {
  checkedAt: string;
  games: Partial<Record<Game, string>>;
}

/**
 * Publishes `downloads/current.json`: each game's current patch, straight from its patch
 * server, regardless of whether that patch has been exported and published yet. A game whose
 * patch server does not answer keeps the value already published, so one flaky check does not
 * blank it out.
 */
export async function publishCurrentPatch(options: {
  games?: string[];
  store?: ObjectStorage;
  env?: NodeJS.ProcessEnv;
  currentPatch?: (game: Game) => Promise<string>;
  log?: (line: string) => void;
  now?: () => Date;
} = {}): Promise<CurrentPatch> {
  const log = options.log ?? console.log;
  const now = options.now ?? (() => new Date());
  const config = datasetStorageConfigFromEnv(options.env ?? process.env);
  const store = options.store ?? createObjectStorage(config);
  const currentPatch = options.currentPatch ?? patchVersion;

  const existing = await readJson<CurrentPatch>(store, CURRENT_KEY);
  const games = { ...existing?.games };
  for (const game of parseGames(options.games)) {
    try {
      games[game] = await currentPatch(game);
      log(`${game}: ${games[game]}`);
    } catch (error) {
      log(`${game}: ${(error as Error).message}, keeping ${games[game] ?? "none"}`);
    }
  }

  const current: CurrentPatch = { checkedAt: now().toISOString(), games };
  await store.put(CURRENT_KEY, JSON.stringify(current), {
    contentType: "application/json; charset=utf-8",
    cacheControl: "public, max-age=60"
  });
  return current;
}
