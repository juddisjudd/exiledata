import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.join(__dirname, "..", "public", "index.html");
const port = Number(process.env.WEB_PORT ?? 4000);

const server = createServer(async (_req, res) => {
  const html = await readFile(indexPath, "utf8");
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
});

server.listen(port, () => {
  console.log(`ExileData web placeholder listening on http://localhost:${port}`);
});
