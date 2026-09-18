import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { LANDING_OG_IMAGE, buildSite, landingCard, loadShell } from "../apps/docs/src/site.js";
import { NAV } from "../apps/docs/src/nav.js";
import { ERROR_CODES, formatJson } from "../apps/docs/src/api-reference.js";
import { renderCodeBlock } from "../apps/docs/src/markdown.js";
import { OG_HEIGHT, OG_WIDTH, cardDescription } from "../apps/docs/src/og.js";

/** Width and height from a PNG's IHDR chunk. */
function pngSize(png: Buffer): [number, number] {
  expect(png.subarray(1, 4).toString()).toBe("PNG");
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
}

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

  it("puts the file browser on the Downloads page, with a fallback without JavaScript", () => {
    const html = pages.get("downloads.html")!;
    const script = /<div id="dl"[\s\S]*?<\/div>\s*<script>([\s\S]*?)<\/script>/.exec(html)?.[1];

    expect(html).toContain(`data-base="https://data.exiledata.dev"`);
    expect(html).toMatch(
      /<noscript>[\s\S]*https:\/\/data\.exiledata\.dev\/index\.json[\s\S]*<\/noscript>/
    );
    expect(html).not.toContain("downloads-browser");
    expect(() => new Function(script!)).not.toThrow();
  });

  it("gives every page a link preview card, and renders the landing page's", async () => {
    for (const page of NAV) {
      const html = pages.get(`${page.slug}.html`)!;
      const image =
        /<meta property="og:image" content="https:\/\/docs\.exiledata\.dev\/([^"]+)"/.exec(
          html
        )?.[1];

      expect(image, page.slug).toBe(`og/${page.slug}.png`);
      expect(html, page.slug).toContain(
        '<meta name="twitter:card" content="summary_large_image" />'
      );
      expect(pngSize(await readFile(path.join(out, image!))), page.slug).toEqual([
        OG_WIDTH,
        OG_HEIGHT
      ]);
    }
    expect(pages.get("404.html")).not.toContain("og:image");

    const landing = await readFile(
      new URL("../apps/web/public/index.html", import.meta.url),
      "utf8"
    );
    expect(landing).toContain(
      `<meta property="og:image" content="https://docs.exiledata.dev/${LANDING_OG_IMAGE}" />`
    );
    expect(pngSize(await readFile(path.join(out, LANDING_OG_IMAGE)))).toEqual([
      OG_WIDTH,
      OG_HEIGHT
    ]);
    expect((await landingCard()).title).toBe("Game data for Path of Exile tools.");
  });

  it("writes descriptions as plain text, decoding what markdown escaped", () => {
    expect(pages.get("sources.html")).toContain("the game client's own files");
    expect(pages.get("sources.html")).not.toContain("&amp;#39;");
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

  it("marks API, Downloads and Changelog on their pages and Docs everywhere else", async () => {
    const current = async (file: string) =>
      /<a class="[^"]*" href="([^"]*)" aria-current="true">/.exec(
        await readFile(path.join(out, file), "utf8")
      )?.[1];

    expect(await current("api.html")).toBe("/api");
    expect(await current("changelog.html")).toBe("/changelog");
    expect(await current("downloads.html")).toBe("/downloads");
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

  it("puts whole sentences on a card, cutting a long first sentence at a word", () => {
    expect(cardDescription("One short sentence. Another one. " + "x ".repeat(80))).toBe(
      "One short sentence. Another one."
    );
    expect(cardDescription("word ".repeat(40), 20)).toBe("word word word word…");
  });

  it("keeps short JSON values on one line and breaks long ones", () => {
    expect(formatJson({ games: ["poe1", "poe2"] })).toBe('{ "games": ["poe1", "poe2"] }');
    expect(formatJson({ a: "x".repeat(80) })).toBe(`{\n  "a": "${"x".repeat(80)}"\n}`);
  });
});
