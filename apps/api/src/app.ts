import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import { requireApiKey } from "./plugins/auth.js";
import { createHealthRoutes } from "./routes/health.js";
import { createAdminRoutes } from "./routes/admin.js";
import gamesRoutes from "./routes/v1/games.js";
import { createVersionsRoutes } from "./routes/v1/versions.js";
import { createGameDataRoutes } from "./routes/v1/game-data.js";
import { loadConfig, type AppConfig } from "./config.js";
import { createDatasetReader, type DatasetReader } from "./datasets.js";
import { createPgDb, type Db } from "./db.js";
import { registerOpenApi } from "./openapi.js";
import { KeyStore } from "./auth/key-store.js";
import { Authenticator } from "./auth/authenticator.js";
import { RateLimiter } from "./auth/rate-limiter.js";
import { UsageRecorder } from "./auth/usage.js";

export interface BuildAppOptions {
  config?: AppConfig;
  reader?: DatasetReader;
  /** Injected in tests; otherwise a pool is opened from `DATABASE_URL` and closed with the app. */
  db?: Db;
  logger?: boolean;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const config = options.config ?? loadConfig();
  if (!config.apiKeySecret) throw new Error("API_KEY_SECRET is required");
  if (!options.db && !config.databaseUrl) throw new Error("DATABASE_URL is required");

  const db = options.db ?? createPgDb(config.databaseUrl!);
  const reader = options.reader ?? createDatasetReader(config);
  const app = Fastify({ logger: options.logger ?? true });

  const store = new KeyStore(db);
  const authenticator = new Authenticator(store, config.apiKeySecret);
  const limiter = new RateLimiter();
  const usage = new UsageRecorder(store, (error) =>
    app.log.error({ err: error }, "failed to write api key usage")
  );

  usage.start();
  app.addHook("onClose", async () => {
    await usage.stop();
    if (!options.db) await db.close?.();
  });

  registerOpenApi(app);
  app.setErrorHandler<FastifyError>(async (error, request, reply) => {
    if (error.validation || (error.statusCode && error.statusCode < 500)) {
      return reply
        .code(error.statusCode ?? 400)
        .send({ error: "invalid_request", message: error.message });
    }
    request.log.error({ err: error }, "unhandled error");
    return reply
      .code(500)
      .send({ error: "internal_error", message: "The server failed to handle the request." });
  });
  app.setNotFoundHandler(async (request, reply) =>
    reply.code(404).send({
      error: "not_found",
      message: `No route for ${request.method} ${request.url.split("?")[0]}`
    })
  );

  app.get("/openapi.json", { schema: { hide: true } }, async (_request, reply) =>
    reply.header("access-control-allow-origin", "*").send(app.swagger())
  );

  app.decorateRequest("apiKey", null);
  app.register(createHealthRoutes(config, store));
  app.register(createAdminRoutes({ config, store, authenticator, usage }));
  app.register(async (v1) => {
    requireApiKey(v1, { authenticator, limiter, usage });
    v1.register(gamesRoutes);
    v1.register(createVersionsRoutes(reader));
    v1.register(createGameDataRoutes(reader));
  });

  return app;
}
