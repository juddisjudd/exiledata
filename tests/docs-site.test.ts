import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildSite } from "../apps/docs/src/site.js";
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
