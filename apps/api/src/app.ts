import Fastify, { type FastifyInstance } from "fastify";
import authPlugin from "./plugins/auth.js";
import healthRoutes from "./routes/health.js";
import gamesRoutes from "./routes/v1/games.js";
import { createVersionsRoutes } from "./routes/v1/versions.js";
import { createGameDataRoutes } from "./routes/v1/game-data.js";
import { loadConfig, type AppConfig } from "./config.js";
import { createDatasetReader, type DatasetReader } from "./datasets.js";

export interface BuildAppOptions {
  config?: AppConfig;
  reader?: DatasetReader;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const config = options.config ?? loadConfig();
  const reader = options.reader ?? createDatasetReader(config);
  const app = Fastify({ logger: true });

  app.register(authPlugin);
  app.register(healthRoutes);
  app.register(gamesRoutes);
  app.register(createVersionsRoutes(reader));
  app.register(createGameDataRoutes(reader));

  return app;
}
