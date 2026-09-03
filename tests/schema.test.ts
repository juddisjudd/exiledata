import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SkillGem } from "../packages/schema/src/entities/skillGem.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("schema", () => {
  it("fixture matches the SkillGem shape", () => {
    const raw = readFileSync(
      path.join(__dirname, "..", "data/fixtures/poe1/skill-gem.sample.json"),
      "utf8"
    );
    const fixture = JSON.parse(raw);
    const gem: SkillGem = fixture;

    expect(gem.id).toBe("poe1-skill-gem-fireball");
    expect(gem.version.game).toBe("poe1");
    expect(gem.source[0].name).toBe("repoe");
    expect(Array.isArray(gem.grantedSkillIds)).toBe(true);
  });
});
