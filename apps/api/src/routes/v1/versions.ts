import type { FastifyPluginAsync } from "fastify";
import type { DatasetMetadata, Game, VersionsResponse } from "@exiledata/types";
import type { DatasetReader } from "../../datasets.js";

const GAMES: Game[] = ["poe1", "poe2"];

/**
 * Lists every published dataset with its metadata, so a client can pin to a patch instead of
 * assuming "latest" is stable. Metadata is read out of each dataset payload, which the reader
 * caches until the patch is re-ingested, so repeat calls do not re-fetch.
 */
export function createVersionsRoutes(reader: DatasetReader): FastifyPluginAsync {
  return async (app) => {
    app.get<{ Reply: VersionsResponse }>("/v1/versions", async () => {
      const datasets: DatasetMetadata[] = [];

      for (const game of GAMES) {
        for (const { gameVersion } of await reader.list(game)) {
          const dataset = await reader.get(game, gameVersion);
          if (dataset) datasets.push(dataset.metadata);
        }
      }

      return { datasets };
    });
  };
}
