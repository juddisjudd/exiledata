import { Marked, type Tokens } from "marked";

export interface Heading {
  id: string;
  text: string;
}

export interface RenderedMarkdown {
  title: string;
  html: string;
  /** Level-2 headings, listed under the current page in the sidebar. */
  headings: Heading[];
}

const LANG_LABELS: Record<string, string> = {
  sh: "Shell",
  json: "JSON",
  http: "HTTP",
  ts: "TypeScript",
  js: "JavaScript"
};

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z]+;/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Wraps matches of `pattern` by class; text between matches is escaped as-is. */
function tokenize(code: string, pattern: RegExp, classify: (match: RegExpExecArray) => string) {
  let out = "";
  let last = 0;
  for (let match = pattern.exec(code); match; match = pattern.exec(code)) {
    out += escapeHtml(code.slice(last, match.index));
    const cls = classify(match);
    out += cls ? `<span class="${cls}">${escapeHtml(match[0])}</span>` : escapeHtml(match[0]);
    last = match.index + match[0].length;
  }
  return out + escapeHtml(code.slice(last));
}

function highlightJson(code: string): string {
  return tokenize(
    code,
    /("(?:[^"\\\n]|\\.)*")(?=\s*:)|("(?:[^"\\\n]|\\.)*")|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}[\],:…]/g,
    (m) => (m[1] ? "t-k" : m[2] ? "t-s" : /^[{}[\],:…]$/.test(m[0]) ? "t-p" : "t-s")
  );
}

function highlightShell(code: string): string {
  return tokenize(
    code,
    /^\$ |#.*$|"(?:[^"\\\n]|\\.)*"|'[^'\n]*'|(?<=\s)-{1,2}[A-Za-z][\w-]*/gm,
    (m) => (m[0] === "$ " || m[0].startsWith("#") ? "t-p" : m[0].startsWith("-") ? "t-k" : "t-s")
  );
}

export function renderCodeBlock(code: string, lang = ""): string {
  const body =
    lang === "json" ? highlightJson(code) : lang === "sh" ? highlightShell(code) : escapeHtml(code);
  const label = LANG_LABELS[lang] ?? lang;
  return (
    `<div class="code"><div class="code-bar"><span class="label">${escapeHtml(label)}</span>` +
    `<button class="copy" type="button">Copy</button></div>` +
    `<pre><code>${body}</code></pre></div>\n`
  );
}

/** Rewrites `./page.md` links to site paths so content links work in an editor and on the site. */
function siteHref(href: string): string {
  const match = /^(?:\.\/)?([a-z0-9-]+)\.md(#.*)?$/.exec(href);
  if (!match) return href;
  const path = match[1] === "index" ? "/" : `/${match[1]}`;
  return path + (match[2] ?? "");
}

export function renderMarkdown(source: string): RenderedMarkdown {
  let title = "";
  const headings: Heading[] = [];
  const marked = new Marked({ gfm: true });

  marked.use({
    renderer: {
      heading({ tokens, depth }: Tokens.Heading) {
        const inner = this.parser.parseInline(tokens);
        if (depth === 1) {
          title = inner.replace(/<[^>]+>/g, "");
          return `<h1>${inner}</h1>\n`;
        }
        const id = slugify(inner);
        if (depth === 2) headings.push({ id, text: inner.replace(/<[^>]+>/g, "") });
        return (
          `<h${depth} id="${id}">${inner}` +
          `<a class="anchor" href="#${id}" aria-label="Link to this section">#</a></h${depth}>\n`
        );
      },
      code({ text, lang }: Tokens.Code) {
        return renderCodeBlock(text, lang ?? "");
      },
      link({ href, title: linkTitle, tokens }: Tokens.Link) {
        const inner = this.parser.parseInline(tokens);
        const external = /^https?:\/\//.test(href);
        return (
          `<a href="${escapeHtml(siteHref(href))}"` +
          (linkTitle ? ` title="${escapeHtml(linkTitle)}"` : "") +
          (external ? ` rel="noopener"` : "") +
          `>${inner}</a>`
        );
      },
      table(token: Tokens.Table) {
        const cell = (c: Tokens.TableCell, tag: "th" | "td") => {
          const align = c.align ? ` style="text-align:${c.align}"` : "";
          return `<${tag}${align}>${this.parser.parseInline(c.tokens)}</${tag}>`;
        };
        const head = `<tr>${token.header.map((c) => cell(c, "th")).join("")}</tr>`;
        const rows = token.rows.map((r) => `<tr>${r.map((c) => cell(c, "td")).join("")}</tr>`);
        return (
          `<div class="table"><table><thead>${head}</thead>` +
          `<tbody>${rows.join("")}</tbody></table></div>\n`
        );
      }
    }
  });

  const html = marked.parse(source, { async: false });
  return { title, html, headings };
}

/** Inline markdown only, for descriptions that come from the OpenAPI document. */
export function renderInline(source: string): string {
  return new Marked().parseInline(source, { async: false });
}
