import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const contentDir = path.join(__dirname, "..", "content");
const port = Number(process.env.DOCS_PORT ?? 4100);

/** Minimal markdown-file server. Renders raw markdown as plain text — no rendering pipeline yet. */
const server = createServer(async (req, res) => {
  const slug = (req.url ?? "/").replace(/^\/+/, "") || "index";
  const filePath = path.join(contentDir, `${slug}.md`);

  try {
    const markdown = await readFile(filePath, "utf8");
    res.writeHead(200, { "content-type": "text/markdown; charset=utf-8" });
    res.end(markdown);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end(`Not found: ${slug}`);
  }
});

server.listen(port, () => {
  console.log(`ExileData docs placeholder listening on http://localhost:${port}`);
});
