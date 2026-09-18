import type { FastifyPluginAsync } from "fastify";
import type { BaseItem, Game, ListResponse } from "@exiledata/types";
import type { DatasetReader } from "../../datasets.js";

const GAMES: Game[] = ["poe1", "poe2"];

/** Resources the dataset pipeline does not produce yet. */
const UNIMPLEMENTED = ["items", "mods", "gems", "skills"] as const;

const MAX_LIMIT = 1000;
const DEFAULT_LIMIT = 100;

interface GameParam {
  game: string;
}

interface BasesQuery {
  version?: string;
  itemClass?: string;
  limit?: string;
  offset?: string;
}

function isGame(value: string): value is Game {
  return (GAMES as string[]).includes(value);
}

/**
 * Per-game data endpoints. Only `bases` is served today — it is backed by the base-item dataset
 * produced by `exiledata ingest`. The rest stay 501 rather than returning fabricated data.
 *
 * Requests are answered from one game patch. `?version=` selects a patch explicitly (e.g.
 * `4.5.5.3`); without it the most recent published patch is used and echoed back in
 * `meta.gameVersion`, so a client can pin to what it just read.
 */
export function createGameDataRoutes(reader: DatasetReader): FastifyPluginAsync {
  return async (app) => {
    app.get<{ Params: GameParam; Querystring: BasesQuery; Reply: ListResponse<BaseItem> | object }>(
      "/v1/:game/bases",
      async (request, reply) => {
        const { game } = request.params;
        if (!isGame(game)) {
          return reply.code(404).send({ error: "unknown_game", message: `Unknown game "${game}"` });
        }

        const gameVersion = request.query.version ?? (await reader.latestVersion(game));
        if (!gameVersion) {
          return reply.code(404).send({
            error: "no_dataset",
            message: `No dataset has been published for "${game}"`
          });
        }

        const dataset = await reader.get(game, gameVersion);
        if (!dataset) {
          return reply.code(404).send({
            error: "unknown_game_version",
            message: `No dataset for "${game}" patch "${gameVersion}"`
          });
        }

        const limit = clamp(request.query.limit, DEFAULT_LIMIT, MAX_LIMIT);
        const offset = Math.max(0, Number(request.query.offset ?? 0) || 0);

        let entities = dataset.entities as BaseItem[];
        if (request.query.itemClass) {
          entities = entities.filter((entity) => entity.itemClass === request.query.itemClass);
        }

        return reply.send({
          data: entities.slice(offset, offset + limit),
          meta: { game, gameVersion, total: entities.length }
        });
      }
    );

    for (const resource of UNIMPLEMENTED) {
      app.get<{ Params: GameParam }>(`/v1/:game/${resource}`, async (request, reply) => {
        return reply.code(501).send({
          error: "not_implemented",
          message:
            `GET /v1/${request.params.game}/${resource} is not implemented yet — ` +
            `only "bases" is produced by the ingestion pipeline so far`
        });
      });
    }
  };
}

function clamp(raw: string | undefined, fallback: number, max: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}
