import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Authenticator } from "../auth/authenticator.js";
import type { ActiveKey } from "../auth/key-store.js";
import type { RateLimiter } from "../auth/rate-limiter.js";
import type { UsageRecorder } from "../auth/usage.js";

declare module "fastify" {
  interface FastifyRequest {
    apiKey: ActiveKey | null;
  }
}

export interface ApiKeyAuthDeps {
  authenticator: Authenticator;
  limiter: RateLimiter;
  usage: UsageRecorder;
}

/**
 * Requires a valid API key on every route in `scope`, applies the key's per-minute limit, and
 * counts the request against the key. Hooks are added to the scope directly, so they cover
 * exactly the routes registered in it — `/health`, `/status` and `/admin` stay outside.
 */
export function requireApiKey(scope: FastifyInstance, deps: ApiKeyAuthDeps): void {
  scope.addHook("onRequest", async (request, reply) => {
    const presented = presentedKey(request);
    if (!presented) {
      return reply.code(401).send({
        error: "missing_api_key",
        message: "Send an API key in the x-api-key header."
      });
    }

    const key = await deps.authenticator.authenticate(presented);
    if (!key) {
      return reply
        .code(401)
        .send({ error: "invalid_api_key", message: "The API key is invalid or revoked." });
    }
    request.apiKey = key;

    const limit = deps.limiter.take(key.id, key.rateLimitPerMinute);
    const resetSeconds = Math.ceil(limit.resetMs / 1000);
    reply.header("x-ratelimit-limit", key.rateLimitPerMinute);
    reply.header("x-ratelimit-remaining", limit.remaining);
    reply.header("x-ratelimit-reset", resetSeconds);

    if (!limit.allowed) {
      return reply
        .code(429)
        .header("retry-after", resetSeconds)
        .send({
          error: "rate_limited",
          message: `Rate limit of ${key.rateLimitPerMinute} requests per minute exceeded.`
        });
    }
  });

  scope.addHook("onResponse", async (request, reply) => {
    if (request.apiKey) deps.usage.record(request.apiKey.id, reply.statusCode);
  });
}

function presentedKey(request: FastifyRequest): string | undefined {
  const header = request.headers["x-api-key"];
  if (typeof header === "string" && header.trim()) return header.trim();

  const bearer = /^Bearer\s+(.+)$/i.exec(request.headers.authorization ?? "")?.[1]?.trim();
  return bearer || undefined;
}
