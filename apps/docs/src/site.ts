import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderApiReference, type OpenApiDocument } from "./api-reference.js";
import { escapeHtml, renderMarkdown, type Heading } from "./markdown.js";
import { NAV, hrefFor, type NavPage } from "./nav.js";

const docsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Inputs outside apps/docs: the landing page (source of the shared header and footer), the
 * shared stylesheet and fonts, and the API's OpenAPI document.
 */
export const PATHS = {
  content: path.join(docsDir, "content"),
  docsCss: path.join(docsDir, "public", "docs.css"),
  landing: path.join(docsDir, "..", "web", "public", "index.html"),
  baseCss: path.join(docsDir, "..", "web", "public", "base.css"),
  fonts: path.join(docsDir, "..", "web", "public", "assets", "fonts"),
  openapi: path.join(docsDir, "..", "api", "openapi.json"),
  out: path.join(docsDir, "dist", "site")
};

const DOCS_ORIGIN = "https://docs.exiledata.dev";

export interface Shell {
  header: string;
  footer: string;
}

/**
 * The header and footer, taken verbatim from the landing page so the two sites cannot drift.
 * Links to the docs become site paths, which keeps local builds on the local server.
 */
export async function loadShell(): Promise<Shell> {
  const landing = await readFile(PATHS.landing, "utf8");
  const header = /<header class="top">[\s\S]*?<\/header>/.exec(landing)?.[0];
  const footer = /<footer class="foot">[\s\S]*?<\/footer>/.exec(landing)?.[0];
  if (!header || !footer) throw new Error(`No header or footer found in ${PATHS.landing}`);

  const local = (html: string) => html.replaceAll(`href="${DOCS_ORIGIN}/`, `href="/`);
  return { header: local(header), footer: local(footer) };
}

/** Marks the header link for the section a page belongs to. */
function markSection(header: string, slug: string | undefined): string {
  if (!slug) return header;
  const href = slug === "api" || slug === "changelog" ? `/${slug}` : "/";
  return header.replace(`href="${href}">`, `href="${href}" aria-current="true">`);
}

const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Crect width='16' height='16' rx='3' fill='%230b0b0c'/%3E%3Cpath d='M4.5 3.5h7v1.75H6.25v1.9h4.5v1.7h-4.5v1.9h5.25v1.75h-7z' fill='%23f2f2f4'/%3E%3C/svg%3E";

const COPY_SCRIPT = `
for (const button of document.querySelectorAll(".code .copy")) {
  button.addEventListener("click", async () => {
    const code = button.closest(".code").querySelector("pre").innerText;
    try {
      await navigator.clipboard.writeText(code.replace(/^\\$ /gm, ""));
      button.textContent = "Copied";
      setTimeout(() => (button.textContent = "Copy"), 1500);
    } catch {
      button.textContent = "Select and copy";
    }
  });
}`;

interface PageContent {
  page: NavPage;
  title: string;
  html: string;
  headings: Heading[];
}

function navList(current: NavPage, headings: Heading[]): string {
  const groups = [...new Set(NAV.map((p) => p.group))];
  return groups
    .map((group) => {
      const items = NAV.filter((p) => p.group === group)
        .map((p) => {
          const active = p.slug === current.slug;
          const sub =
            active && headings.length
              ? `<ul class="sub">${headings
                  .map((h) => `<li><a href="#${h.id}">${escapeHtml(h.text)}</a></li>`)
                  .join("")}</ul>`
              : "";
          return (
            `<li><a href="${hrefFor(p.slug)}"${active ? ` class="active" aria-current="page"` : ""}>` +
            `${escapeHtml(p.title)}</a>${sub}</li>`
          );
        })
        .join("");
      return `<p class="label">${escapeHtml(group)}</p><ul>${items}</ul>`;
    })
    .join("");
}

function pager(current: NavPage): string {
  const index = NAV.findIndex((p) => p.slug === current.slug);
  const prev = NAV[index - 1];
  const next = NAV[index + 1];
  const link = (p: NavPage | undefined, label: string, cls: string) =>
    p
      ? `<a class="${cls}" href="${hrefFor(p.slug)}"><span class="label">${label}</span>${escapeHtml(p.title)}</a>`
      : `<span></span>`;
  return `<nav class="pager" aria-label="Pages">${link(prev, "Previous", "prev")}${link(next, "Next", "next")}</nav>`;
}

function describe(html: string): string {
  const lede = /<\/h1>\s*<p>([\s\S]*?)<\/p>/.exec(html)?.[1] ?? "";
  const text = lede
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 160 ? `${text.slice(0, 157)}…` : text;
}

function layout(options: {
  shell: Shell;
  slug?: string;
  title: string;
  description: string;
  body: string;
  nav?: string;
  noindex?: boolean;
}): string {
  const { shell, title, description, body, nav } = options;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    ${options.noindex ? `<meta name="robots" content="noindex" />` : ""}
    <meta name="theme-color" content="#0b0b0c" />
    <link rel="icon" href="${FAVICON}" />
    <link rel="preload" href="https://exiledata.dev/assets/fonts/geist-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="preload" href="https://exiledata.dev/assets/fonts/geist-mono-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="stylesheet" href="/base.css" />
    <link rel="stylesheet" href="/docs.css" />
  </head>
  <body>
    <svg width="0" height="0" style="position: absolute" aria-hidden="true">
      <symbol id="mark" viewBox="0 0 16 16"><path d="M3 2h10v2.5H5.75v2.25h6.5v2.5h-6.5v2.25H13V14H3z" /></symbol>
    </svg>
    <a class="skip" href="#content">Skip to content</a>
    ${markSection(shell.header, options.slug)}
    <div class="docs">
      ${nav ? `<aside class="side"><nav aria-label="Documentation">${nav}</nav></aside>` : ""}
      <main id="content" class="doc">
        ${nav ? `<details class="mobile-nav"><summary class="btn sm">Contents</summary><nav aria-label="Documentation">${nav}</nav></details>` : ""}
        ${body}
      </main>
    </div>
    ${shell.footer}
    <script>${COPY_SCRIPT}</script>
  </body>
</html>
`;
}

async function loadPage(page: NavPage, openapi: OpenApiDocument): Promise<PageContent> {
  if (page.source === "api") {
    const { html, headings } = renderApiReference(openapi);
    return { page, title: page.title, html, headings };
  }
  const source = await readFile(path.join(PATHS.content, `${page.slug}.md`), "utf8");
  const { title, html, headings } = renderMarkdown(source);
  return { page, title: title || page.title, html, headings };
}

/** Renders the whole site into `outDir`, replacing what was there. Returns the pages written. */
export async function buildSite(outDir = PATHS.out): Promise<string[]> {
  const openapiSource = await readFile(PATHS.openapi, "utf8");
  const openapi = JSON.parse(openapiSource) as OpenApiDocument;
  const shell = await loadShell();

  const contentFiles = (await readdir(PATHS.content)).filter((f) => f.endsWith(".md"));
  const listed = new Set(NAV.filter((p) => p.source === "markdown").map((p) => `${p.slug}.md`));
  const unlisted = contentFiles.filter((f) => !listed.has(f));
  if (unlisted.length) throw new Error(`Pages missing from src/nav.ts: ${unlisted.join(", ")}`);

  await rm(outDir, { recursive: true, force: true });
  await mkdir(path.join(outDir, "assets", "fonts"), { recursive: true });

  const written: string[] = [];
  for (const page of NAV) {
    const content = await loadPage(page, openapi);
    const file = `${page.slug}.html`;
    const title = page.slug === "index" ? "ExileData docs" : `${content.title} · ExileData docs`;
    await writeFile(
      path.join(outDir, file),
      layout({
        shell,
        slug: page.slug,
        title,
        description: describe(content.html),
        nav: navList(page, content.headings),
        body: `<article class="prose">${content.html}</article>${pager(page)}`
      })
    );
    written.push(file);
  }

  await writeFile(
    path.join(outDir, "404.html"),
    layout({
      shell,
      title: "Page not found · ExileData docs",
      description: "This page does not exist.",
      noindex: true,
      body:
        `<article class="prose lost"><p class="label mono">404</p><h1>Page not found.</h1>` +
        `<p>Nothing lives at this address in the docs.</p>` +
        `<p><a class="btn primary lg" href="/">Go to the overview</a></p></article>`
    })
  );
  written.push("404.html");

  await writeFile(path.join(outDir, "openapi.json"), openapiSource);
  await copyFile(PATHS.baseCss, path.join(outDir, "base.css"));
  await copyFile(PATHS.docsCss, path.join(outDir, "docs.css"));
  for (const font of await readdir(PATHS.fonts)) {
    await copyFile(path.join(PATHS.fonts, font), path.join(outDir, "assets", "fonts", font));
  }

  return written;
}
