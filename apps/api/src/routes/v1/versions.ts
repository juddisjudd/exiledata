import type { FastifyPluginAsync } from "fastify";
import type { DatasetMetadata, Game, VersionsResponse } from "@exiledata/types";
import type { DatasetReader } from "../../datasets.js";
import { KEY_ERRORS, TAG, errors } from "../../openapi.js";

const GAMES: Game[] = ["poe1", "poe2"];

/**
 * Lists every published dataset with its metadata, so a client can pin to a patch instead of
 * assuming "latest" is stable. Metadata is read out of each dataset payload, which the reader
 * caches until the patch is re-ingested, so repeat calls do not re-fetch.
 */
export function createVersionsRoutes(reader: DatasetReader): FastifyPluginAsync {
  return async (app) => {
    app.get<{ Reply: VersionsResponse }>(
      "/v1/versions",
      {
        schema: {
          tags: [TAG.datasets],
          summary: "List published datasets",
          description:
            "One entry per published game patch, oldest patch first within each game. The " +
            "last entry for a game is the one that answers when no `version` is given.",
          response: {
            200: {
              description: "Published datasets.",
              type: "object",
              required: ["datasets"],
              properties: { datasets: { type: "array", items: { $ref: "DatasetMetadata#" } } },
              examples: [
                {
                  datasets: [
                    {
                      game: "poe1",
                      gameVersion: "3.29.3.3",
                      generatedAt: "2026-09-18T16:14:25.635Z",
                      schemaVersion: "0.2.0",
                      sources: [
                        {
                          name: "poe1-ggpk-extract",
                          version: "3.29.3.3",
                          retrievedAt: "2026-09-18T16:14:25.635Z"
                        }
                      ]
                    }
                  ]
                }
              ]
            },
            ...errors(KEY_ERRORS)
          }
        }
      },
      async () => {
        const datasets: DatasetMetadata[] = [];

        for (const game of GAMES) {
          for (const { gameVersion } of await reader.list(game)) {
            const dataset = await reader.get(game, gameVersion);
            if (dataset) datasets.push(dataset.metadata);
          }
        }

        return { datasets };
      }
    );
  };
}
