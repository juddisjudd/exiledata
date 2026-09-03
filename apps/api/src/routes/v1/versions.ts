import type { FastifyPluginAsync } from "fastify";
import type { VersionsResponse } from "@exiledata/types";

/**
 * Placeholder — real implementation reads dataset metadata from storage/PostgreSQL
 * (see /migrations and the root README's dataset architecture section). No dataset has been
 * generated yet, so this returns an empty list rather than inventing data.
 */
const versionsRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Reply: VersionsResponse }>("/v1/versions", async () => ({
    datasets: []
  }));
};

export default versionsRoutes;
