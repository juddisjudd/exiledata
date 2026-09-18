import {
  compareGameVersions,
  createDatasetStorage,
  datasetStorageConfigFromEnv,
  describeDatasetStorage,
  type StoredDataset
} from "@exiledata/storage";
import { GAMES, parseGame } from "./games.js";
import { megabytes, printTable, shortTime } from "./format.js";

function storageFromEnv() {
  const config = datasetStorageConfigFromEnv(process.env);
  return { storage: createDatasetStorage(config), where: describeDatasetStorage(config) };
}

export async function listDatasets(options: { game?: string }): Promise<void> {
  const { storage, where } = storageFromEnv();
  const games = options.game ? [parseGame(options.game)] : GAMES;

  const datasets: StoredDataset[] = [];
  for (const game of games) {
    const entries = await storage.list(game);
    datasets.push(...entries.sort((a, b) => compareGameVersions(a.gameVersion, b.gameVersion)));
  }

  console.log(`Datasets in ${where}:`);
  if (datasets.length === 0) {
    console.log("(none)");
    return;
  }
  printTable(
    ["GAME", "VERSION", "SIZE", "MODIFIED (UTC)"],
    datasets.map((d) => [d.game, d.gameVersion, megabytes(d.size), shortTime(d.lastModified)])
  );
}

export async function deleteDataset(options: {
  game: string;
  patch: string;
  yes?: boolean;
}): Promise<void> {
  const game = parseGame(options.game);
  const { storage, where } = storageFromEnv();

  const exists = (await storage.list(game)).some((d) => d.gameVersion === options.patch);
  if (!exists) throw new Error(`${game}/${options.patch} does not exist in ${where}.`);
  if (!options.yes) {
    throw new Error(`Refusing to delete ${game}/${options.patch} from ${where} without --yes.`);
  }

  await storage.delete(game, options.patch);
  console.log(`Deleted ${game}/${options.patch} from ${where}.`);
}
