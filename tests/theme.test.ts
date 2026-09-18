import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildSite } from "../apps/docs/src/site.js";
import { NAV } from "../apps/docs/src/nav.js";

const web = new URL("../apps/web/public/", import.meta.url);
const adminPage = new URL("../apps/api/public/admin.html", import.meta.url);

/** The dark palette the sites shipped with; the theme work must not change it. */
const DARK = {
  "bg-0": "#0b0b0c",
  "bg-1": "#101012",
  "bg-2": "#151518",
  "line-0": "#1c1c21",
  "line-1": "#27272d",
  "line-2": "#35353d",
  "fg-0": "#f2f2f4",
  "fg-1": "#b9b9c1",
  "fg-2": "#80808a",
  "fg-3": "#56565f",
  focus: "#7f9dff"
};

function tokens(css: string): Map<string, { light: string; dark: string }> {
  const out = new Map<string, { light: string; dark: string }>();
  for (const [, name, light, dark] of css.matchAll(
    /--([a-z0-9-]+):\s*light-dark\(\s*([^,()]+(?:\([^)]*\))?)\s*,\s*([^()]+?(?:\([^)]*\))?)\s*\)\s*;/g
  )) {
    out.set(name!, { light: light!.trim(), dark: dark!.trim() });
  }
  return out;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

describe("themes", () => {
  let base: string;
  let admin: string;

  beforeAll(async () => {
    base = await readFile(new URL("base.css", web), "utf8");
    admin = await readFile(adminPage, "utf8");
  });

  it("defaults to the system theme and lets data-theme force either one", () => {
    for (const css of [base, admin]) {
      expect(css).toMatch(/:root\s*{\s*color-scheme: light dark;/);
      expect(css).toMatch(/:root\[data-theme="light"\]\s*{\s*color-scheme: light;/);
      expect(css).toMatch(/:root\[data-theme="dark"\]\s*{\s*color-scheme: dark;/);
      expect(css).not.toContain("@media (prefers-color-scheme");
    }
  });

  it("keeps the dark palette exactly as it was", () => {
    for (const css of [base, admin]) {
      const t = tokens(css);
      for (const [name, value] of Object.entries(DARK)) expect(t.get(name)?.dark, name).toBe(value);
    }
  });

  it("gives the site and the admin panel the same colors", () => {
    const site = tokens(base);
    for (const [name, pair] of tokens(admin)) {
      if (site.has(name)) expect(pair, name).toEqual(site.get(name));
    }
  });

  it("raises light surfaces above the page instead of mirroring the dark steps", () => {
    const t = tokens(base);
    const page = t.get("bg-0")!.light;
    // Dark mode: raised surfaces are lighter than the page. Light mode keeps that rule.
    expect(luminance(t.get("bg-1")!.light)).toBeGreaterThan(luminance(page));
    expect(luminance(t.get("bg-1")!.dark)).toBeGreaterThan(luminance(t.get("bg-0")!.dark));
    // Tables get a white body in light mode, where the dark theme leaves them transparent.
    expect(t.get("table-bg")).toEqual({ light: "#ffffff", dark: "transparent" });
  });

  it("keeps body and secondary text readable on light surfaces", () => {
    const t = tokens(base);
    for (const surface of ["bg-0", "bg-1"]) {
      expect(contrast(t.get("fg-0")!.light, t.get(surface)!.light)).toBeGreaterThan(12);
      expect(contrast(t.get("fg-1")!.light, t.get(surface)!.light)).toBeGreaterThan(7);
      expect(contrast(t.get("fg-2")!.light, t.get(surface)!.light)).toBeGreaterThan(4.5);
    }
  });

  it("draws the admin usage grid in blue on light and white on dark", () => {
    expect(tokens(admin).get("heat")).toEqual({ light: "#3558d6", dark: "#f2f2f4" });
    expect(admin).toContain('"color-mix(in oklab, var(--heat) "');
  });
});

describe("theme switch wiring", () => {
  let out: string;
  const pages = new Map<string, string>();

  beforeAll(async () => {
    out = await mkdtemp(path.join(tmpdir(), "exiledata-theme-"));
    await buildSite(out);
    for (const file of ["index.html", "404.html"]) {
      pages.set(`web/${file}`, await readFile(new URL(file, web), "utf8"));
    }
    for (const file of [...NAV.map((p) => `${p.slug}.html`), "404.html"]) {
      pages.set(`docs/${file}`, await readFile(path.join(out, file), "utf8"));
    }
    pages.set("admin", await readFile(adminPage, "utf8"));
  });

  afterAll(async () => {
    await rm(out, { recursive: true, force: true });
  });

  it("applies a saved theme before the stylesheets load, on every page", () => {
    for (const [name, html] of pages) {
      const boot = html.indexOf("exiledata_theme=(light|dark)");
      const firstStyle = html.search(/<link rel="stylesheet"|<style>/);
      expect(boot, name).toBeGreaterThan(-1);
      expect(boot, name).toBeLessThan(firstStyle);
    }
  });

  it("offers System, Light and Dark, with System selected by default", () => {
    for (const [name, html] of pages) {
      const choices = [...html.matchAll(/data-theme-choice="(\w+)"\s+aria-pressed="(\w+)"/g)].map(
        (m) => `${m[1]}=${m[2]}`
      );
      expect(choices.slice(0, 3), name).toEqual(["system=true", "light=false", "dark=false"]);
    }
  });

  it("ships theme.js with the landing page and the docs", () => {
    expect(existsSync(path.join(out, "theme.js"))).toBe(true);
    for (const [name, html] of pages) {
      if (name !== "admin") expect(html, name).toContain('<script src="/theme.js" defer></script>');
    }
  });

  it("stores the choice in one cookie shared across exiledata.dev subdomains", async () => {
    const script = await readFile(new URL("theme.js", web), "utf8");
    const admin = pages.get("admin")!;

    for (const source of [script, admin]) {
      expect(source).toContain("exiledata_theme");
      expect(source).toContain("Domain=exiledata.dev");
    }
  });
});
