import type { FastifyPluginAsync } from "fastify";
import type { BaseItem, Game, ListResponse } from "@exiledata/types";
import type { DatasetReader } from "../../datasets.js";
import { KEY_ERRORS, TAG, errors } from "../../openapi.js";

const GAMES: Game[] = ["poe1", "poe2"];

/** Resources the dataset pipeline does not produce yet. */
const UNIMPLEMENTED = ["items", "mods", "gems", "skills"] as const;

interface GameParam {
  game: string;
}

interface BasesQuery {
  version?: string;
  itemClass?: string;
  limit: number;
  offset: number;
}

function isGame(value: string): value is Game {
  return (GAMES as string[]).includes(value);
}

const gameParam = {
  type: "object",
  required: ["game"],
  properties: {
    game: { type: "string", description: "`poe1` or `poe2`.", examples: ["poe2"] }
  }
};

const basesSchema = {
  tags: [TAG.data],
  summary: "List base items",
  description:
    "Base items from one game patch, in the order the game files list them. Without " +
    "`version`, the highest published patch answers, and `meta.gameVersion` names it.",
  params: gameParam,
  querystring: {
    type: "object",
    properties: {
      version: {
        type: "string",
        description: "Game patch to read, e.g. `4.5.5.3`. Default: the highest published patch.",
        examples: ["4.5.5.3"]
      },
      itemClass: {
        type: "string",
        description: "Only items of this class. Exact match, e.g. `Amulet`.",
        examples: ["Amulet"]
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 1000,
        default: 100,
        description: "Records to return.",
        examples: [1]
      },
      offset: {
        type: "integer",
        minimum: 0,
        default: 0,
        description: "Records to skip. Use with `limit` to page through results."
      }
    }
  },
  response: {
    200: {
      description: "The requested page of base items.",
      type: "object",
      required: ["data", "meta"],
      properties: {
        data: { type: "array", items: { $ref: "BaseItem#" } },
        meta: { $ref: "ListMeta#" }
      },
      examples: [
        {
          data: [
            {
              id: "Metadata/Items/Amulets/FourAmulet1",
              name: "Crimson Amulet",
              itemClass: "Amulet",
              version: { schemaVersion: "0.2.0", game: "poe2", gameVersion: "4.5.5.3" },
              source: [
                {
                  name: "poe2-ggpk-extract",
                  version: "4.5.5.3",
                  retrievedAt: "2026-09-18T16:14:26.910Z",
                  locator: "base_items.json#Metadata/Items/Amulets/FourAmulet1"
                }
              ],
              ext: {
                domain: "item",
                drop_level: 1,
                implicit_text: ["(2-4) Life Regeneration per second"],
                tags: ["amulet", "default"]
              }
            }
          ],
          meta: { game: "poe2", gameVersion: "4.5.5.3", total: 25 }
        }
      ]
    },
    ...errors({
      400: "A query parameter is out of range, e.g. `limit=5000`.",
      ...KEY_ERRORS,
      404: "Unknown game (`unknown_game`), no dataset for the game (`no_dataset`), or no dataset for that patch (`unknown_game_version`)."
    })
  }
};

/**
 * Per-game data endpoints. Only `bases` is served today — it is backed by the base-item dataset
 * produced by `exiledata ingest`. The rest stay 501 rather than returning fabricated data, and
 * are left out of the OpenAPI document until they exist.
 */
export function createGameDataRoutes(reader: DatasetReader): FastifyPluginAsync {
  return async (app) => {
    app.get<{ Params: GameParam; Querystring: BasesQuery; Reply: ListResponse<BaseItem> | object }>(
      "/v1/:game/bases",
      { schema: basesSchema },
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

        const { limit, offset, itemClass } = request.query;
        let entities = dataset.entities as BaseItem[];
        if (itemClass) {
          entities = entities.filter((entity) => entity.itemClass === itemClass);
        }

        return reply.send({
          data: entities.slice(offset, offset + limit),
          meta: { game, gameVersion, total: entities.length }
        });
      }
    );

    for (const resource of UNIMPLEMENTED) {
      app.get<{ Params: GameParam }>(
        `/v1/:game/${resource}`,
        { schema: { hide: true } },
        async (request, reply) => {
          return reply.code(501).send({
            error: "not_implemented",
            message:
              `GET /v1/${request.params.game}/${resource} is not implemented yet — ` +
              `only "bases" is produced by the ingestion pipeline so far`
          });
        }
      );
    }
  };
}
