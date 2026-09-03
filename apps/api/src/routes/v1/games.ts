import type { FastifyPluginAsync } from "fastify";
import type { GamesResponse } from "@exiledata/types";

const gamesRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Reply: GamesResponse }>("/v1/games", async () => ({
    games: ["poe1", "poe2"]
  }));
};

export default gamesRoutes;
