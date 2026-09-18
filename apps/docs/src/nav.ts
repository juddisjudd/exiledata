/** Every page, in reading order. The sidebar and the previous/next links follow this list. */
export interface NavPage {
  slug: string;
  title: string;
  group: string;
  /** "api" is generated from the OpenAPI document; the rest come from `content/{slug}.md`. */
  source: "markdown" | "api";
}

export const NAV: NavPage[] = [
  { slug: "index", title: "Overview", group: "Start", source: "markdown" },
  { slug: "authentication", title: "Authentication", group: "Start", source: "markdown" },
  { slug: "datasets", title: "Datasets and versions", group: "Data", source: "markdown" },
  { slug: "schema", title: "Record format", group: "Data", source: "markdown" },
  { slug: "sources", title: "Data sources", group: "Data", source: "markdown" },
  { slug: "api", title: "API reference", group: "Reference", source: "api" },
  { slug: "changelog", title: "Changelog", group: "Reference", source: "markdown" }
];

export function hrefFor(slug: string): string {
  return slug === "index" ? "/" : `/${slug}`;
}
