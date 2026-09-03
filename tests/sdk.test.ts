import { describe, it, expect } from "vitest";
import { ExileDataClient } from "../packages/client/src/client.js";

describe("ExileDataClient", () => {
  it("exposes poe1 and poe2 namespaces with resource methods", () => {
    const client = new ExileDataClient({ apiKey: "test" });

    expect(client.poe1.gems.list).toBeTypeOf("function");
    expect(client.poe2.items.list).toBeTypeOf("function");
    expect(client.poe2.bases.list).toBeTypeOf("function");
    expect(client.poe2.mods.list).toBeTypeOf("function");
    expect(client.poe2.skills.list).toBeTypeOf("function");
  });
});
