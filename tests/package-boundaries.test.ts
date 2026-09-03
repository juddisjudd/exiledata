import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readPackageJson(relativePath: string) {
  return JSON.parse(readFileSync(path.join(__dirname, "..", relativePath), "utf8"));
}

describe("package boundaries", () => {
  it("packages/schema does not depend on ingestion or app packages", () => {
    const pkg = readPackageJson("packages/schema/package.json");
    const deps = Object.keys(pkg.dependencies ?? {});
    expect(
      deps.some((d: string) => d.includes("ingestion") || d.startsWith("@exiledata/api"))
    ).toBe(false);
  });

  it("ingestion/common does not depend on apps or the client SDK", () => {
    const pkg = readPackageJson("ingestion/common/package.json");
    const deps = Object.keys(pkg.dependencies ?? {});
    expect(
      deps.some((d: string) => d.includes("@exiledata/client") || d.includes("@exiledata/api"))
    ).toBe(false);
  });
});
