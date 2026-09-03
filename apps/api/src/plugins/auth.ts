import type { FastifyPluginAsync } from "fastify";

/**
 * Placeholder authentication plugin. Establishes where API-key enforcement will live without
 * implementing real key storage/validation yet (see root README constraints — no complicated
 * auth platform, no billing, but the architecture should support keys/revocation/rate limits).
 *
 * Currently: reads `x-api-key`/`Authorization` and exposes it on the request for future use.
 * Does NOT yet reject unauthenticated requests — that will change once key storage exists in
 * PostgreSQL (see /migrations).
 */
declare module "fastify" {
  interface FastifyRequest {
    apiKey?: string;
  }
}

const authPlugin: FastifyPluginAsync = async (app) => {
  app.decorateRequest("apiKey", undefined);

  app.addHook("onRequest", async (request) => {
    const header = request.headers["x-api-key"];
    request.apiKey = typeof header === "string" ? header : undefined;
  });
};

export default authPlugin;
