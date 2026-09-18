import { describe, it, expect } from "vitest";
import { loadConfig } from "../apps/api/src/config.js";

describe("api config", () => {
  it("applies sensible defaults", () => {
    const config = loadConfig({});
    expect(config.port).toBe(3000);
    expect(config.nodeEnv).toBe("development");
    expect(config.defaultRateLimitPerMinute).toBe(120);
    expect(config.adminToken).toBeUndefined();
  });

  it("reads overrides from environment variables", () => {
    const config = loadConfig({
      API_PORT: "8080",
      NODE_ENV: "production",
      DEFAULT_RATE_LIMIT_PER_MINUTE: "600"
    });
    expect(config.port).toBe(8080);
    expect(config.nodeEnv).toBe("production");
    expect(config.defaultRateLimitPerMinute).toBe(600);
  });

  it("refuses a short admin token", () => {
    expect(() => loadConfig({ ADMIN_TOKEN: "short" })).toThrow(/at least 32/);
  });

  it("treats a blank admin token as unset", () => {
    expect(loadConfig({ ADMIN_TOKEN: "  " }).adminToken).toBeUndefined();
  });

  it("refuses a non-positive default rate limit", () => {
    expect(() => loadConfig({ DEFAULT_RATE_LIMIT_PER_MINUTE: "0" })).toThrow(/positive integer/);
  });
});
