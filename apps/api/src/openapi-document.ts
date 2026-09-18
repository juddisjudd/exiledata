import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

/**
 * Builds the OpenAPI document from the real route definitions. No request is served, so the
 * database and dataset storage are never touched; the stub below only satisfies `buildApp`.
 */
export async function generateOpenApiDocument(): Promise<unknown> {
  const app = buildApp({
    config: { ...loadConfig({}), apiKeySecret: "openapi-generation" },
    db: { query: async () => ({ rows: [] }) },
    logger: false
  });
  try {
    await app.ready();
    return app.swagger();
  } finally {
    await app.close();
  }
}

/** The document as committed to `apps/api/openapi.json`. */
export async function renderOpenApiDocument(): Promise<string> {
  return JSON.stringify(await generateOpenApiDocument(), null, 2) + "\n";
}
