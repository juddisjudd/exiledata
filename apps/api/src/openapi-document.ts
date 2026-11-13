import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

/** Serves no requests, so the stub dependencies below are never called. */
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
