import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");
const port = Number(process.env.WEB_PORT ?? 4000);

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8"
};

/** Local stand-in for the Workers static assets binding, including its 404-page handling. */
const server = createServer(async (req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
  const relative = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const filePath = path.resolve(publicDir, relative);

  try {
    if (!filePath.startsWith(publicDir + path.sep)) throw new Error("outside public/");
    const body = await readFile(filePath);
    res.writeHead(200, {
      "content-type": TYPES[path.extname(filePath)] ?? "application/octet-stream"
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": TYPES[".html"] });
    res.end(await readFile(path.join(publicDir, "404.html")));
  }
});

server.listen(port, () => {
  console.log(`ExileData web listening on http://localhost:${port}`);
});
