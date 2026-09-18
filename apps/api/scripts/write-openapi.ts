import { writeFile } from "node:fs/promises";
import { renderOpenApiDocument } from "../src/openapi-document.js";

const target = new URL("../openapi.json", import.meta.url);
await writeFile(target, await renderOpenApiDocument(), "utf8");
console.log(`Wrote ${target.pathname}`);
