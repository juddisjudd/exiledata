import type { Game } from "@exiledata/schema";

const VERSION_SEGMENT = /^[0-9A-Za-z][0-9A-Za-z._-]*$/;

/** The version becomes a path segment, so a value such as `../x` must not escape the prefix. */
export function datasetKey(game: Game, gameVersion: string): string {
  if (!VERSION_SEGMENT.test(gameVersion) || gameVersion.includes("..")) {
    throw new Error(`Invalid game version "${gameVersion}"`);
  }
  return `${game}/${gameVersion}/dataset.json`;
}

/** Orders a game's patches; PoE 2's old 4.x numbers sort as the 0.x GGG renumbered them to, just before it. */
export function compareGameVersions(game: Game, a: string, b: string): number {
  if (game !== "poe2") return compareDotted(a, b);
  const renumbered = (v: string) => (v.startsWith("4.") ? `0.${v.slice(2)}` : v);
  return (
    compareDotted(renumbered(a), renumbered(b)) ||
    Number(b.startsWith("4.")) - Number(a.startsWith("4."))
  );
}

/** Compares dotted versions numerically, so "0.5.10.0" sorts after "0.5.9.3". */
function compareDotted(a: string, b: string): number {
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
