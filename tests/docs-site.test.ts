import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildSite, loadShell } from "../apps/docs/src/site.js";
import { NAV } from "../apps/docs/src/nav.js";
import { ERROR_CODES, formatJson } from "../apps/docs/src/api-reference.js";
import { renderCodeBlock } from "../apps/docs/src/markdown.js";

const apiSrc = new URL("../apps/api/src/", import.meta.url);

async function sourceFiles(dir: URL): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".ts"))
    .map((e) => path.join(e.parentPath, e.name));
}

describe("docs site", () => {
  let out: string;
  const pages = new Map<string, string>();

  beforeAll(async () => {
    out = await mkdtemp(path.join(tmpdir(), "exiledata-docs-"));
    for (const file of await buildSite(out)) {
      pages.set(file, await readFile(path.join(out, file), "utf8"));
    }
  });

  afterAll(async () => {
    await rm(out, { recursive: true, force: true });
  });

  it("writes every page in the nav, a 404 page, the stylesheets, fonts and spec", () => {
    for (const page of NAV) expect(pages.has(`${page.slug}.html`), page.slug).toBe(true);
    expect(pages.has("404.html")).toBe(true);
    for (const asset of [
      "base.css",
      "docs.css",
      "openapi.json",
      "assets/fonts/geist-latin-wght-normal.woff2",
      "assets/fonts/geist-mono-latin-wght-normal.woff2"
    ]) {
      expect(existsSync(path.join(out, asset)), asset).toBe(true);
    }
  });

  it("has no broken internal links or anchors", () => {
    const ids = new Map<string, Set<string>>();
    for (const [file, html] of pages) {
      ids.set(file, new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]!)));
    }

    const broken: string[] = [];
    for (const [file, html] of pages) {
      for (const [, href] of html.matchAll(/href="([^"]+)"/g)) {
        if (!href || /^(https?:|mailto:|data:)/.test(href)) continue;
        const [target = "", anchor] = href.split("#");
        const targetFile =
          target === "" ? file : target === "/" ? "index.html" : `${target.slice(1)}.html`;
        if (target && !pages.has(targetFile) && !existsSync(path.join(out, target))) {
          broken.push(`${file}: ${href}`);
        } else if (anchor && !ids.get(targetFile)?.has(anchor)) {
          broken.push(`${file}: ${href} (no #${anchor})`);
        }
      }
    }

    expect(broken).toEqual([]);
  });

  it("documents every path in the OpenAPI document", async () => {
    const spec = JSON.parse(await readFile(path.join(out, "openapi.json"), "utf8"));
    const api = pages.get("api.html")!;

    for (const route of Object.keys(spec.paths)) expect(api, route).toContain(`>${route}</code>`);
    for (const schema of Object.keys(spec.components.schemas)) {
      expect(api, schema).toContain(`id="schema-${schema.toLowerCase()}"`);
    }
  });

  it("marks the current page in the sidebar", () => {
    expect(pages.get("authentication.html")).toMatch(
      /<a href="\/authentication" class="active" aria-current="page">/
    );
  });

  it("leaves no rendering artifacts", () => {
    for (const [file, html] of pages) {
      expect(html, file).not.toContain("[object Object]");
      expect(html, file).not.toMatch(/\]\([^)]*\.md\)/);
    }
  });
});

describe("header and footer shared by exiledata.dev and the docs", () => {
  const web = new URL("../apps/web/public/", import.meta.url);
  const block = (html: string, tag: "header" | "footer") =>
    new RegExp(`<${tag} class="(?:top|foot)">[\\s\\S]*?</${tag}>`).exec(html)?.[0];
  let out: string;

  beforeAll(async () => {
    out = await mkdtemp(path.join(tmpdir(), "exiledata-shell-"));
    await buildSite(out);
  });

  afterAll(async () => {
    await rm(out, { recursive: true, force: true });
  });

  it("uses the same header and footer on the landing page and its 404 page", async () => {
    const index = await readFile(new URL("index.html", web), "utf8");
    const notFound = await readFile(new URL("404.html", web), "utf8");

    for (const tag of ["header", "footer"] as const) {
      expect(block(index, tag), tag).toBeDefined();
      expect(block(notFound, tag), tag).toBe(block(index, tag));
    }
  });

  it("puts the landing page's header and footer on every docs page, marking one section", async () => {
    const shell = await loadShell();

    for (const file of [...NAV.map((p) => `${p.slug}.html`), "404.html"]) {
      const html = await readFile(path.join(out, file), "utf8");
      const header = block(html, "header")!;
      const marked = header.match(/ aria-current="true"/g)?.length ?? 0;

      expect(header.replace(' aria-current="true"', ""), file).toBe(shell.header);
      expect(block(html, "footer"), file).toBe(shell.footer);
      expect(marked, file).toBe(file === "404.html" ? 0 : 1);
    }
  });

  it("marks API and Changelog on their pages and Docs everywhere else", async () => {
    const current = async (file: string) =>
      /<a class="[^"]*" href="([^"]*)" aria-current="true">/.exec(
        await readFile(path.join(out, file), "utf8")
      )?.[1];

    expect(await current("api.html")).toBe("/api");
    expect(await current("changelog.html")).toBe("/changelog");
    expect(await current("schema.html")).toBe("/");
  });

  it("loads fonts from exiledata.dev on both sites, with a local fallback", async () => {
    const css = await readFile(new URL("base.css", web), "utf8");
    const headers = await readFile(new URL("_headers", web), "utf8");
    const docsPage = await readFile(path.join(out, "index.html"), "utf8");

    for (const face of css.match(/@font-face\s*{[^}]*}/g) ?? []) {
      expect(face).toMatch(
        /src:\s*url\("https:\/\/exiledata\.dev\/assets\/fonts\/[^"]+"\)[^,]*,\s*url\("\/assets\/fonts\//
      );
    }
    expect(headers).toMatch(/\/assets\/fonts\/\*\n\s+Access-Control-Allow-Origin: \*/);
    expect(docsPage).toContain(
      'href="https://exiledata.dev/assets/fonts/geist-latin-wght-normal.woff2"'
    );
  });
});

describe("error code table", () => {
  it("lists exactly the codes the public API can send", async () => {
    const sent = new Set<string>();
    for (const file of await sourceFiles(apiSrc)) {
      if (file.endsWith(path.join("routes", "admin.ts"))) continue;
      const source = await readFile(file, "utf8");
      for (const [, code] of source.matchAll(/error: "([a-z_]+)"/g)) sent.add(code!);
    }

    expect([...sent].sort()).toEqual(ERROR_CODES.map(([code]) => code).sort());
  });
});

describe("docs rendering helpers", () => {
  it("escapes HTML inside code blocks", () => {
    const html = renderCodeBlock('{ "name": "<script>alert(1)</script>" }', "json");

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("keeps short JSON values on one line and breaks long ones", () => {
    expect(formatJson({ games: ["poe1", "poe2"] })).toBe('{ "games": ["poe1", "poe2"] }');
    expect(formatJson({ a: "x".repeat(80) })).toBe(`{\n  "a": "${"x".repeat(80)}"\n}`);
  });
});
