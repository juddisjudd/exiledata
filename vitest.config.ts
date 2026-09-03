import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node"
  },
  resolve: {
    alias: {
      "@exiledata/schema": path.resolve(rootDir, "packages/schema/src/index.ts"),
      "@exiledata/types": path.resolve(rootDir, "packages/types/src/index.ts"),
      "@exiledata/ingestion-common": path.resolve(rootDir, "ingestion/common/src/index.ts")
    }
  }
});
