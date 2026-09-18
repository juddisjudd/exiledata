import type { Game } from "@exiledata/schema";

const VERSION_SEGMENT = /^[0-9A-Za-z][0-9A-Za-z._-]*$/;

/**
 * Object key for a dataset. The version becomes a path segment, so it is checked here rather
 * than trusted — a value such as `../x` from a malformed `version.txt` must not escape the
 * game's prefix.
 */
export function datasetKey(game: Game, gameVersion: string): string {
  if (!VERSION_SEGMENT.test(gameVersion) || gameVersion.includes("..")) {
    throw new Error(`Invalid game version "${gameVersion}"`);
  }
  return `${game}/${gameVersion}/dataset.json`;
}

/** Compares dotted versions numerically, so "4.5.10.0" sorts after "4.5.9.3". */
export function compareGameVersions(a: string, b: string): number {
  const left = a.split(".");
  const right = b.split(".");
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const x = left[i] ?? "0";
    const y = right[i] ?? "0";
    const nx = Number(x);
    const ny = Number(y);
    const diff = Number.isInteger(nx) && Number.isInteger(ny) ? nx - ny : x.localeCompare(y);
    if (diff !== 0) return diff;
  }
  return 0;
}
