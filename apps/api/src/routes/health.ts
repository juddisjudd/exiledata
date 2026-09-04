import type { FastifyPluginAsync } from "fastify";
import type { AppConfig } from "../config.js";

export function createHealthRoutes(config: AppConfig): FastifyPluginAsync {
  return async (app) => {
    app.get("/health", async () => ({ status: "ok" }));

    /**
     * Reports which dataset storage the process actually resolved. A deployment reading the
     * wrong driver otherwise looks identical to one with no datasets published.
     */
    app.get("/status", async () => ({
      status: "ok",
      uptimeSeconds: Math.round(process.uptime()),
      nodeVersion: process.version,
      datasetStorage:
        config.datasetStorage.driver === "r2"
          ? { driver: "r2", bucket: config.datasetStorage.bucketName }
          : { driver: "local", path: config.datasetStorage.path }
    }));
  };
}
