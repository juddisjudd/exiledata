import { watch } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { PATHS, buildSite } from "./site.js";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8"
};

async function build(): Promise<void> {
  const pages = await buildSite();
  console.log(`Built ${pages.length} pages into ${path.relative(process.cwd(), PATHS.out)}`);
}

/** Serves the built site like the Workers assets binding: `/x` -> `x.html`, else 404.html. */
async function dev(): Promise<void> {
  await build();
  const port = Number(process.env.DOCS_PORT ?? 4100);

  createServer(async (req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
    const candidates =
      urlPath === "/" ? ["index.html"] : [urlPath.slice(1), `${urlPath.slice(1)}.html`];
    for (const candidate of candidates) {
      const file = path.resolve(PATHS.out, candidate);
      if (!file.startsWith(PATHS.out + path.sep)) break;
      try {
        const body = await readFile(file);
        res.writeHead(200, {
          "content-type": TYPES[path.extname(file)] ?? "application/octet-stream"
        });
        res.end(body);
        return;
      } catch {
        // try the next candidate
      }
    }
    res.writeHead(404, { "content-type": TYPES[".html"] });
    res.end(await readFile(path.join(PATHS.out, "404.html")));
  }).listen(port, () => console.log(`Docs at http://localhost:${port}`));

  let timer: NodeJS.Timeout | undefined;
  const rebuild = () => {
    clearTimeout(timer);
    timer = setTimeout(() => build().catch((error) => console.error(error.message)), 100);
  };
  watch(PATHS.content, { recursive: true }, rebuild);
  for (const file of [
    PATHS.docsCss,
    PATHS.baseCss,
    PATHS.openapi,
    PATHS.fileMapJs,
    PATHS.fileMapData
  ]) {
    watch(file, rebuild);
  }
  watch(PATHS.tooltip, { recursive: true }, rebuild);
}

const command = process.argv[2];
if (command === "build") {
  await build();
} else if (command === "dev") {
  await dev();
} else {
  console.error("Usage: tsx src/cli.ts build|dev");
  process.exitCode = 1;
}
