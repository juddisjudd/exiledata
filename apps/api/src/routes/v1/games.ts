import type { FastifyPluginAsync } from "fastify";
import type { GamesResponse } from "@exiledata/types";
import { KEY_ERRORS, TAG, errors } from "../../openapi.js";

const gamesRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Reply: GamesResponse }>(
    "/v1/games",
    {
      schema: {
        tags: [TAG.datasets],
        summary: "List games",
        description: "The games ExileData covers. Use one as `{game}` in other paths.",
        response: {
          200: {
            description: "Supported games.",
            type: "object",
            required: ["games"],
            properties: {
              games: { type: "array", items: { type: "string", enum: ["poe1", "poe2"] } }
            },
            examples: [{ games: ["poe1", "poe2"] }]
          },
          ...errors(KEY_ERRORS)
        }
      }
    },
    async () => ({ games: ["poe1", "poe2"] })
  );
};

export default gamesRoutes;
