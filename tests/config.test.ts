import { describe, it, expect } from "vitest";
import { loadConfig } from "../apps/api/src/config.js";

describe("api config", () => {
  it("applies sensible defaults", () => {
    const config = loadConfig({});
    expect(config.port).toBe(3000);
    expect(config.nodeEnv).toBe("development");
    expect(config.rateLimit.maxRequests).toBe(120);
  });

  it("reads overrides from environment variables", () => {
    const config = loadConfig({ API_PORT: "8080", NODE_ENV: "production" });
    expect(config.port).toBe(8080);
    expect(config.nodeEnv).toBe("production");
  });
});
