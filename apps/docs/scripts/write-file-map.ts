import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";
import { DATA_ORIGIN } from "../src/downloads.js";
import {
  PatchFiles,
  buildGameMap,
  type FileMapData,
  type Game,
  type Manifest
} from "../src/file-map-data.js";

/**
 * Writes data/file-map.json from the newest published patch of each game. `--dir poe2=<folder>`
 * reads an unpacked patch folder instead of downloading the zip.
 */
const target = new URL("../data/file-map.json", import.meta.url);
const GAMES: Game[] = ["poe2", "poe1"];

const dirs = new Map(
  process.argv
    .slice(2)
    .filter((_, i, all) => all[i - 1] === "--dir")
    .map((arg) => arg.split("=") as [Game, string])
);

async function fetchOk(url: string): Promise<Response> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response;
}

async function readFolder(dir: string): Promise<Map<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>();
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".min.json")) continue;
    const full = path.join(entry.parentPath, entry.name);
    files.set(path.relative(dir, full).split(path.sep).join("/"), await readFile(full));
  }
  return files;
}

async function download(game: Game, patch: string): Promise<Map<string, Uint8Array>> {
  const zip = await fetchOk(`${DATA_ORIGIN}/${game}/${patch}/${game}-${patch}.zip`);
  const entries = unzipSync(new Uint8Array(await zip.arrayBuffer()), {
    filter: (file) => file.name.endsWith(".min.json")
  });
  // Entries sit under a `{game}-{patch}/` folder.
  return new Map(
    Object.entries(entries).map(([name, bytes]) => [name.slice(name.indexOf("/") + 1), bytes])
  );
}

const index = (await (await fetchOk(`${DATA_ORIGIN}/index.json`)).json()) as {
  games: Partial<Record<Game, { latest: string }>>;
};
const data: FileMapData = { generatedAt: new Date().toISOString(), games: {} };

for (const game of GAMES) {
  const patch = index.games[game]?.latest;
  if (!patch) throw new Error(`index.json lists no ${game} patch`);
  const manifest = (await (
    await fetchOk(`${DATA_ORIGIN}/${game}/${patch}/manifest.json`)
  ).json()) as Manifest;
  const dir = dirs.get(game);
  const files = dir ? await readFolder(dir) : await download(game, patch);
  const map = buildGameMap(new PatchFiles(game, patch, files), manifest);
  data.games[game] = map;
  const partial = map.links.filter((l) => l.hit < l.total).length;
  console.log(
    `${game} ${patch}: ${Object.keys(map.nodes).length} files, ${map.links.length} links, ${partial} partial`
  );
}

await mkdir(new URL(".", target), { recursive: true });
await writeFile(target, JSON.stringify(data, null, 2) + "\n", "utf8");
console.log(`Wrote ${fileURLToPath(target)}`);
