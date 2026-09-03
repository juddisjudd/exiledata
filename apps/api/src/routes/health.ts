import type { FastifyPluginAsync } from "fastify";

const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/health", async () => ({ status: "ok" }));

  app.get("/status", async () => ({
    status: "ok",
    uptimeSeconds: Math.round(process.uptime()),
    nodeVersion: process.version
  }));
};

export default healthRoutes;
