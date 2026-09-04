import type { FastifyPluginAsync } from "fastify";
import type { DatasetMetadata, Game, VersionsResponse } from "@exiledata/types";
import type { DatasetReader } from "../../datasets.js";

const GAMES: Game[] = ["poe1", "poe2"];

/**
 * Lists every published dataset with its metadata, so a client can pin to a version instead of
 * assuming "latest" is stable. Metadata is read out of each dataset payload; datasets are
 * immutable and cached after first read, so repeat calls do not re-fetch.
 */
export function createVersionsRoutes(reader: DatasetReader): FastifyPluginAsync {
  return async (app) => {
    app.get<{ Reply: VersionsResponse }>("/v1/versions", async () => {
      const datasets: DatasetMetadata[] = [];

      for (const game of GAMES) {
        for (const version of await reader.listVersions(game)) {
          const dataset = await reader.get(game, version);
          if (dataset) datasets.push(dataset.metadata);
        }
      }

      return { datasets };
    });
  };
}
