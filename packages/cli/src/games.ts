import type { Game } from "@exiledata/schema";

export const GAMES: Game[] = ["poe1", "poe2"];

export function parseGame(value: string): Game {
  if (!(GAMES as string[]).includes(value)) {
    throw new Error(`Unknown game "${value}". Expected one of: ${GAMES.join(", ")}.`);
  }
  return value as Game;
}
