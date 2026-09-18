import { readFileSync } from "node:fs";
import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import type {
  AdminCreateKeyRequest,
  AdminCreateKeyResponse,
  AdminKeyResponse,
  AdminKeysResponse,
  AdminUpdateKeyRequest,
  AdminUsageResponse
} from "@exiledata/types";
import type { AppConfig } from "../config.js";
import type { Authenticator } from "../auth/authenticator.js";
import { floorToHour, type KeyStore } from "../auth/key-store.js";
import { displayPrefix, generateApiKey, hashApiKey, secretsMatch } from "../auth/keys.js";
import type { UsageRecorder } from "../auth/usage.js";

export interface AdminRoutesDeps {
  config: AppConfig;
  store: KeyStore;
  authenticator: Authenticator;
  usage: UsageRecorder;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_CLIENT_NAME = 100;
const MAX_RATE_LIMIT = 100_000;
const MAX_USAGE_HOURS = 24 * 90;

const DASHBOARD_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "font-src 'self'",
  "connect-src 'self'",
  "img-src data:",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'"
].join("; ");

const FONTS = ["geist-latin-wght-normal.woff2", "geist-mono-latin-wght-normal.woff2"];

/**
 * `GET /admin` serves the dashboard page, which holds no data until the operator enters the
 * admin token. `/admin/api/*` is the JSON API behind it and the CLI's `keys` commands, guarded
 * by `ADMIN_TOKEN` as a bearer token.
 */
export function createAdminRoutes(deps: AdminRoutesDeps): FastifyPluginAsync {
  const publicDir = new URL("../../public/", import.meta.url);
  const page = readFileSync(new URL("admin.html", publicDir), "utf8");
  const fonts = new Map(
    FONTS.map((name) => [name, readFileSync(new URL(`fonts/${name}`, publicDir))])
  );

  return async (app) => {
    app.get("/admin", async (_request, reply) =>
      reply
        .type("text/html; charset=utf-8")
        .header("content-security-policy", DASHBOARD_CSP)
        .header("cache-control", "no-store")
        .header("x-content-type-options", "nosniff")
        .header("referrer-policy", "no-referrer")
        .send(page)
    );

    app.get<{ Params: { name: string } }>("/admin/fonts/:name", async (request, reply) => {
      const font = fonts.get(request.params.name);
      if (!font) return reply.code(404).send({ error: "not_found", message: "No such font." });
      return reply
        .type("font/woff2")
        .header("cache-control", "public, max-age=31536000, immutable")
        .send(font);
    });

    app.register(async (api) => registerAdminApi(api, deps), { prefix: "/admin/api" });
  };
}

function registerAdminApi(api: FastifyInstance, deps: AdminRoutesDeps): void {
  const { config, store, authenticator, usage } = deps;

  api.addHook("onRequest", async (request, reply) => {
    reply.header("cache-control", "no-store");

    if (!config.adminToken) {
      return reply.code(503).send({
        error: "admin_disabled",
        message: "Set ADMIN_TOKEN on the API to enable the admin API."
      });
    }

    const token = /^Bearer\s+(.+)$/i.exec(request.headers.authorization ?? "")?.[1]?.trim();
    if (!token || !secretsMatch(config.adminToken, token)) {
      return reply
        .code(401)
        .send({ error: "invalid_admin_token", message: "Missing or wrong admin token." });
    }
  });

  // A failed flush keeps its counts queued for the next try; the read still answers.
  const flushUsage = (request: FastifyRequest) =>
    usage.flush().catch((error) => request.log.error({ err: error }, "usage flush failed"));

  api.get<{ Reply: AdminKeysResponse }>("/keys", async (request) => {
    await flushUsage(request);
    return { keys: await store.listKeys() };
  });

  api.post<{ Body: Partial<AdminCreateKeyRequest> }>("/keys", async (request, reply) => {
    const body = request.body ?? {};
    const client = typeof body.client === "string" ? body.client.trim() : "";
    if (!client || client.length > MAX_CLIENT_NAME) {
      return badRequest(reply, `"client" must be a name of 1-${MAX_CLIENT_NAME} characters.`);
    }

    const rateLimitPerMinute = body.rateLimitPerMinute ?? config.defaultRateLimitPerMinute;
    if (!isRateLimit(rateLimitPerMinute)) {
      return badRequest(reply, `"rateLimitPerMinute" must be an integer 1-${MAX_RATE_LIMIT}.`);
    }

    const secret = generateApiKey();
    const key = await store.createKey({
      client,
      hash: hashApiKey(config.apiKeySecret!, secret),
      prefix: displayPrefix(secret),
      rateLimitPerMinute
    });
    authenticator.invalidate();
    request.log.info({ keyId: key.id, client }, "admin issued api key");

    const response: AdminCreateKeyResponse = { key, secret };
    return reply.code(201).send(response);
  });

  api.patch<{ Params: { id: string }; Body: Partial<AdminUpdateKeyRequest> }>(
    "/keys/:id",
    async (request, reply) => {
      const rateLimitPerMinute = request.body?.rateLimitPerMinute;
      if (!isRateLimit(rateLimitPerMinute)) {
        return badRequest(reply, `"rateLimitPerMinute" must be an integer 1-${MAX_RATE_LIMIT}.`);
      }

      const key = UUID.test(request.params.id)
        ? await store.updateRateLimit(request.params.id, rateLimitPerMinute)
        : undefined;
      if (!key) return notFound(reply);

      authenticator.invalidate();
      request.log.info({ keyId: key.id, rateLimitPerMinute }, "admin changed rate limit");
      const response: AdminKeyResponse = { key };
      return response;
    }
  );

  api.post<{ Params: { id: string } }>("/keys/:id/revoke", async (request, reply) => {
    const key = UUID.test(request.params.id) ? await store.revoke(request.params.id) : undefined;
    if (!key) return notFound(reply);

    authenticator.invalidate();
    request.log.info({ keyId: key.id }, "admin revoked api key");
    const response: AdminKeyResponse = { key };
    return response;
  });

  api.get<{ Querystring: { hours?: string } }>("/usage", async (request, reply) => {
    const hours = Number(request.query.hours ?? 168);
    if (!Number.isInteger(hours) || hours < 1 || hours > MAX_USAGE_HOURS) {
      return badRequest(reply, `"hours" must be an integer 1-${MAX_USAGE_HOURS}.`);
    }

    await flushUsage(request);
    const to = new Date(floorToHour(new Date()).getTime() + 3_600_000);
    const from = new Date(to.getTime() - hours * 3_600_000);
    const response: AdminUsageResponse = {
      from: from.toISOString(),
      to: to.toISOString(),
      buckets: await store.usage(from, to)
    };
    return response;
  });
}

function isRateLimit(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= MAX_RATE_LIMIT;
}

function badRequest(reply: FastifyReply, message: string) {
  return reply.code(400).send({ error: "invalid_request", message });
}

function notFound(reply: FastifyReply) {
  return reply.code(404).send({ error: "unknown_key", message: "No API key with that id." });
}
