import { escapeHtml, renderCodeBlock, renderInline, slugify, type Heading } from "./markdown.js";

interface Schema {
  $ref?: string;
  type?: string;
  description?: string;
  enum?: unknown[];
  items?: Schema;
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: boolean | Schema;
  format?: string;
  default?: unknown;
  minimum?: number;
  maximum?: number;
}

interface Parameter {
  name: string;
  in: string;
  required?: boolean;
  description?: string;
  schema: Schema;
  example?: unknown;
}

interface Response {
  description: string;
  content?: Record<string, { schema: Schema; example?: unknown }>;
}

interface Operation {
  tags?: string[];
  summary?: string;
  description?: string;
  parameters?: Parameter[];
  responses: Record<string, Response>;
  security?: unknown[];
}

export interface OpenApiDocument {
  info: { title: string; version: string; description?: string };
  servers?: Array<{ url: string }>;
  tags?: Array<{ name: string; description?: string }>;
  paths: Record<string, Record<string, Operation>>;
  components?: { schemas?: Record<string, Schema> };
}

/** A test checks this list against the codes the API source can send. */
export const ERROR_CODES: Array<[code: string, status: number, meaning: string]> = [
  ["invalid_request", 400, "A parameter is malformed or out of range. `message` says which."],
  ["missing_api_key", 401, "No key was sent. Send it in `x-api-key`."],
  ["invalid_api_key", 401, "The key is unknown or revoked."],
  ["unknown_game", 404, "`{game}` is not `poe1` or `poe2`."],
  ["no_dataset", 404, "Nothing is published for that game yet."],
  ["unknown_game_version", 404, "No dataset exists for that patch. See `GET /v1/versions`."],
  ["not_found", 404, "No such route."],
  ["rate_limited", 429, "The key's per-minute limit is used up. Wait `retry-after` seconds."],
  ["not_implemented", 501, "The resource is planned but not published yet."],
  ["internal_error", 500, "The server failed. Retry later."]
];

const inline = (text?: string) => (text ? renderInline(text) : "");
const refName = (ref: string) => ref.replace(/^#\/components\/schemas\//, "");
const schemaAnchor = (name: string) => `schema-${slugify(name)}`;

function typeOf(schema: Schema): string {
  if (schema.$ref) {
    const name = refName(schema.$ref);
    return `<a href="#${schemaAnchor(name)}">${escapeHtml(name)}</a>`;
  }
  if (schema.enum)
    return schema.enum.map((v) => `<code>${escapeHtml(JSON.stringify(v))}</code>`).join(" | ");
  if (schema.type === "array" && schema.items) return `array of ${typeOf(schema.items)}`;
  if (schema.type === "object" && schema.properties) {
    const fields = Object.entries(schema.properties).map(
      ([name, s]) => `<code>${escapeHtml(name)}</code>: ${typeOf(s)}`
    );
    return `object with ${fields.join(", ")}`;
  }
  if (schema.type === "object" && schema.additionalProperties) return "object (any fields)";
  return escapeHtml(schema.format ? `${schema.type} (${schema.format})` : (schema.type ?? "any"));
}

/** Pretty JSON that keeps short arrays and objects on one line, as people write it. */
export function formatJson(value: unknown, indent = ""): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  const isArray = Array.isArray(value);
  const inner = indent + "  ";
  const entries = isArray
    ? value.map((v) => formatJson(v, inner))
    : Object.entries(value).map(([k, v]) => `${JSON.stringify(k)}: ${formatJson(v, inner)}`);
  const [open, close] = isArray ? ["[", "]"] : ["{", "}"];
  if (entries.length === 0) return open + close;
  const oneLine = isArray ? `[${entries.join(", ")}]` : `{ ${entries.join(", ")} }`;
  if (!oneLine.includes("\n") && indent.length + oneLine.length <= 72) return oneLine;
  return `${open}\n${entries.map((e) => inner + e).join(",\n")}\n${indent}${close}`;
}

function constraints(schema: Schema): string {
  const notes: string[] = [];
  if (schema.minimum !== undefined && schema.maximum !== undefined) {
    notes.push(`${schema.minimum} to ${schema.maximum}.`);
  } else if (schema.minimum !== undefined) {
    notes.push(`At least ${schema.minimum}.`);
  }
  if (schema.default !== undefined) {
    notes.push(`Default: <code>${escapeHtml(JSON.stringify(schema.default))}</code>.`);
  }
  return notes.join(" ");
}

function table(headers: string[], rows: string[][]): string {
  const head = headers.map((h) => `<th>${h}</th>`).join("");
  const body = rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("");
  return `<div class="table"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>\n`;
}

function exampleRequest(baseUrl: string, path: string, op: Operation): string {
  let url = path;
  const query: string[] = [];
  for (const p of op.parameters ?? []) {
    if (p.example === undefined) continue;
    if (p.in === "path") url = url.replace(`{${p.name}}`, String(p.example));
    if (p.in === "query") query.push(`${p.name}=${encodeURIComponent(String(p.example))}`);
  }
  const full = baseUrl + url + (query.length ? `?${query.join("&")}` : "");
  const needsKey = !(Array.isArray(op.security) && op.security.length === 0);
  return needsKey ? `$ curl -H "x-api-key: $EXILEDATA_KEY" \\\n    "${full}"` : `$ curl "${full}"`;
}

function renderOperation(baseUrl: string, path: string, method: string, op: Operation) {
  const title = op.summary ?? `${method.toUpperCase()} ${path}`;
  const id = slugify(title);
  const needsKey = !(Array.isArray(op.security) && op.security.length === 0);
  let html =
    `<h2 id="${id}">${escapeHtml(title)}<a class="anchor" href="#${id}" aria-label="Link to this section">#</a></h2>\n` +
    `<div class="endpoint"><span class="method">${method.toUpperCase()}</span>` +
    `<code class="path">${escapeHtml(path)}</code>` +
    `<span class="auth">${needsKey ? "API key" : "No key"}</span></div>\n`;

  if (op.description) html += `<p>${inline(op.description)}</p>\n`;

  const order = ["path", "query", "header"];
  const params = [...(op.parameters ?? [])].sort(
    (a, b) => order.indexOf(a.in) - order.indexOf(b.in)
  );
  if (params.length) {
    html += `<p class="label sub">Parameters</p>\n`;
    html += table(
      ["Name", "In", "Type", "Description"],
      params.map((p) => [
        `<code>${escapeHtml(p.name)}</code>`,
        escapeHtml(p.in),
        typeOf(p.schema),
        [inline(p.description), p.required ? "Required." : "", constraints(p.schema)]
          .filter(Boolean)
          .join(" ")
      ])
    );
  }

  html += `<p class="label sub">Responses</p>\n`;
  html += table(
    ["Status", "Meaning", "Body"],
    Object.entries(op.responses).map(([status, response]) => {
      const schema = response.content?.["application/json"]?.schema;
      return [
        `<code>${status}</code>`,
        inline(response.description),
        schema ? typeOf(schema) : "–"
      ];
    })
  );

  const ok = Object.entries(op.responses).find(([status]) => status.startsWith("2"))?.[1];
  const example = ok?.content?.["application/json"]?.example;
  html += `<p class="label sub">Example</p>\n`;
  html += renderCodeBlock(exampleRequest(baseUrl, path, op), "sh");
  if (example !== undefined) html += renderCodeBlock(formatJson(example), "json");

  return { html, heading: { id, text: title } };
}

function renderSchema(name: string, schema: Schema): string {
  const id = schemaAnchor(name);
  let html = `<h3 id="${id}">${escapeHtml(name)}<a class="anchor" href="#${id}" aria-label="Link to this section">#</a></h3>\n`;
  if (schema.description) html += `<p>${inline(schema.description)}</p>\n`;
  const required = new Set(schema.required ?? []);
  const fields = Object.entries(schema.properties ?? {});
  if (fields.length) {
    html += table(
      ["Field", "Type", "Description"],
      fields.map(([field, s]) => [
        `<code>${escapeHtml(field)}</code>`,
        typeOf(s),
        [inline(s.description), required.has(field) ? "" : "Optional."].filter(Boolean).join(" ")
      ])
    );
  }
  return html;
}

/** The API reference page body, generated from the OpenAPI document. */
export function renderApiReference(doc: OpenApiDocument): { html: string; headings: Heading[] } {
  const baseUrl = doc.servers?.[0]?.url ?? "https://api.exiledata.dev";
  const headings: Heading[] = [];
  let html =
    `<h1>API reference</h1>\n` +
    `<p>This page lists every public endpoint and is generated from the OpenAPI document the API serves. ` +
    `Base URL: <code>${escapeHtml(baseUrl)}</code>. Schema version ` +
    `<code>${escapeHtml(doc.info.version)}</code>.</p>\n` +
    `<p>Download the document as <a href="/openapi.json">openapi.json</a>, or read it live at ` +
    `<a href="${escapeHtml(baseUrl)}/openapi.json" rel="noopener">${escapeHtml(baseUrl)}/openapi.json</a>. ` +
    `Postman, Insomnia and most client generators can import it. Examples read the key from ` +
    `<code>$EXILEDATA_KEY</code>; see <a href="/authentication">Authentication</a>.</p>\n`;

  const operations = Object.entries(doc.paths).flatMap(([path, methods]) =>
    Object.entries(methods).map(([method, op]) => ({ path, method, op }))
  );

  for (const tag of doc.tags ?? []) {
    const inTag = operations.filter(({ op }) => op.tags?.includes(tag.name));
    if (inTag.length === 0) continue;
    html += `<p class="label group">${escapeHtml(tag.name)}</p>\n`;
    for (const { path, method, op } of inTag) {
      const rendered = renderOperation(baseUrl, path, method, op);
      html += rendered.html;
      headings.push(rendered.heading);
    }
  }

  html +=
    `<h2 id="errors">Errors<a class="anchor" href="#errors" aria-label="Link to this section">#</a></h2>\n` +
    `<p>Every error has the same body: an <code>error</code> code to branch on and a ` +
    `<code>message</code> for people. Codes are stable; messages can change.</p>\n` +
    renderCodeBlock(
      formatJson({
        error: "rate_limited",
        message: "Rate limit of 120 requests per minute exceeded."
      }),
      "json"
    ) +
    table(
      ["Code", "Status", "Meaning"],
      ERROR_CODES.map(([code, status, meaning]) => [
        `<code>${code}</code>`,
        String(status),
        inline(meaning)
      ])
    );
  headings.push({ id: "errors", text: "Errors" });

  const schemas = Object.entries(doc.components?.schemas ?? {});
  if (schemas.length) {
    html +=
      `<h2 id="schemas">Schemas<a class="anchor" href="#schemas" aria-label="Link to this section">#</a></h2>\n` +
      `<p>Shapes used in the responses above. Fields marked optional can be absent.</p>\n` +
      schemas.map(([name, schema]) => renderSchema(name, schema)).join("");
    headings.push({ id: "schemas", text: "Schemas" });
  }

  return { html, headings };
}
