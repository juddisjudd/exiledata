import type { FastifyPluginAsync } from "fastify";
import type { AppConfig } from "../config.js";
import type { KeyStore } from "../auth/key-store.js";
import { TAG } from "../openapi.js";

const DB_PING_TIMEOUT_MS = 2_000;

export function createHealthRoutes(config: AppConfig, store: KeyStore): FastifyPluginAsync {
  return async (app) => {
    app.get(
      "/health",
      {
        schema: {
          tags: [TAG.service],
          summary: "Liveness",
          description: "Answers while the process is up. Checks nothing else.",
          security: [],
          response: {
            200: {
              description: "The process is up.",
              type: "object",
              properties: { status: { type: "string", enum: ["ok"] } },
              examples: [{ status: "ok" }]
            }
          }
        }
      },
      async () => ({ status: "ok" })
    );

    /**
     * Reports which dataset storage the process actually resolved, and whether Postgres answers.
     * A deployment reading the wrong driver otherwise looks identical to one with no datasets
     * published, and a lost database shows up only as 500s on keyed routes.
     */
    app.get(
      "/status",
      {
        schema: {
          tags: [TAG.service],
          summary: "Service status",
          description: "Uptime, database reachability, and which dataset storage is in use.",
          security: [],
          response: {
            200: {
              description: "Current status.",
              type: "object",
              properties: {
                status: { type: "string", enum: ["ok"] },
                uptimeSeconds: { type: "integer" },
                nodeVersion: { type: "string" },
                database: { type: "string", enum: ["ok", "unreachable"] },
                adminApi: { type: "string", enum: ["enabled", "disabled"] },
                datasetStorage: {
                  type: "object",
                  additionalProperties: true,
                  properties: { driver: { type: "string", enum: ["local", "r2"] } }
                }
              },
              examples: [
                {
                  status: "ok",
                  uptimeSeconds: 3600,
                  nodeVersion: "v24.21.0",
                  database: "ok",
                  adminApi: "enabled",
                  datasetStorage: { driver: "r2", bucket: "exiledata-datasets" }
                }
              ]
            }
          }
        }
      },
      async () => ({
        status: "ok",
        uptimeSeconds: Math.round(process.uptime()),
        nodeVersion: process.version,
        database: await databaseStatus(store),
        adminApi: config.adminToken ? "enabled" : "disabled",
        datasetStorage:
          config.datasetStorage.driver === "r2"
            ? { driver: "r2", bucket: config.datasetStorage.bucketName }
            : { driver: "local", path: config.datasetStorage.path }
      })
    );
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
