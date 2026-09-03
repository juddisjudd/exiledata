import Fastify, { type FastifyInstance } from "fastify";
import authPlugin from "./plugins/auth.js";
import healthRoutes from "./routes/health.js";
import gamesRoutes from "./routes/v1/games.js";
import versionsRoutes from "./routes/v1/versions.js";
import gameDataRoutes from "./routes/v1/game-data.js";

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: true });

  app.register(authPlugin);
  app.register(healthRoutes);
  app.register(gamesRoutes);
  app.register(versionsRoutes);
  app.register(gameDataRoutes);

  return app;
}
