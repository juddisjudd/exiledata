import { describe, it, expect } from "vitest";
import { buildApp } from "../apps/api/src/app.js";

describe("api health", () => {
  it("GET /health returns ok", async () => {
    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("GET /v1/games returns poe1 and poe2", async () => {
    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/v1/games" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ games: ["poe1", "poe2"] });
  });

  it("GET /v1/{game}/items returns 501 not implemented", async () => {
    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/v1/poe2/items" });
    expect(response.statusCode).toBe(501);
  });
});
