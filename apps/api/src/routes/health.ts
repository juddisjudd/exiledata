import type { FastifyPluginAsync } from "fastify";
import type { AppConfig } from "../config.js";
import type { KeyStore } from "../auth/key-store.js";

const DB_PING_TIMEOUT_MS = 2_000;

export function createHealthRoutes(config: AppConfig, store: KeyStore): FastifyPluginAsync {
  return async (app) => {
    app.get("/health", async () => ({ status: "ok" }));

    /**
     * Reports which dataset storage the process actually resolved, and whether Postgres answers.
     * A deployment reading the wrong driver otherwise looks identical to one with no datasets
     * published, and a lost database shows up only as 500s on keyed routes.
     */
    app.get("/status", async () => ({
      status: "ok",
      uptimeSeconds: Math.round(process.uptime()),
      nodeVersion: process.version,
      database: await databaseStatus(store),
      adminApi: config.adminToken ? "enabled" : "disabled",
      datasetStorage:
        config.datasetStorage.driver === "r2"
          ? { driver: "r2", bucket: config.datasetStorage.bucketName }
          : { driver: "local", path: config.datasetStorage.path }
    }));
  };
}

async function databaseStatus(store: KeyStore): Promise<"ok" | "unreachable"> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), DB_PING_TIMEOUT_MS);
  });
  try {
    await Promise.race([store.ping(), timeout]);
    return "ok";
  } catch {
    return "unreachable";
  } finally {
    clearTimeout(timer);
  }
}
