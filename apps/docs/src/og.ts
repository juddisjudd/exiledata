import { readFile } from "node:fs/promises";
import path from "node:path";
import { render, type Font } from "takumi-js";
import { escapeHtml } from "./markdown.js";

/** Open Graph card size, the 1.91:1 ratio link previews crop to. */
export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

export interface OgCard {
  /** Small uppercase line above the title. */
  eyebrow?: string;
  title: string;
  description?: string;
  /** The page address without the scheme, shown along the bottom. */
  url: string;
}

/** The site's dark tokens from apps/web/public/base.css. */
const C = {
  bg: "#0b0b0c",
  line0: "#1c1c21",
  line1: "#27272d",
  fg0: "#f2f2f4",
  fg1: "#b9b9c1",
  fg2: "#80808a"
};

const MARK = "M3 2h10v2.5H5.75v2.25h6.5v2.5h-6.5v2.25H13V14H3z";

function svg(size: number, attrs: string): string {
  const doc =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 16 16">` +
    `<path d="${MARK}" ${attrs}/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(doc).toString("base64")}`;
}

/** The E spans 12 of its 16 units; at 453px it fills the band between the two rules. */
const BIG_MARK = 453;
const SMALL_MARK = 30;

const CSS = `
.card { display: flex; flex-direction: column; width: 100%; height: 100%; padding: 0 80px;
  background: ${C.bg}; color: ${C.fg0}; font-family: Geist; position: relative; }
.big { position: absolute; left: 875px; top: 92px; width: ${BIG_MARK}px; height: ${BIG_MARK}px; }
.top { display: flex; align-items: center; justify-content: space-between; height: 112px;
  border-bottom: 1px solid ${C.line0}; }
.brand { display: flex; align-items: center; gap: 18px; }
.mark { width: ${SMALL_MARK}px; height: ${SMALL_MARK}px; }
.name { font-size: 24px; font-weight: 600; letter-spacing: 0.12em; }
.thin { font-weight: 400; color: ${C.fg2}; }
.label { font-size: 18px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase;
  color: ${C.fg2}; }
.body { display: flex; flex-direction: column; justify-content: center; flex: 1; max-width: 800px; }
.label + .title { margin-top: 22px; }
.title { font-size: 76px; font-weight: 500; line-height: 1.08;
  letter-spacing: -0.02em; }
.desc { margin-top: 26px; font-size: 28px; line-height: 1.4; color: ${C.fg1}; line-clamp: 3; text-overflow: ellipsis; overflow: hidden; }
.foot { display: flex; align-items: center; justify-content: space-between; height: 104px;
  border-top: 1px solid ${C.line0}; }
.url { font-family: "Geist Mono"; font-size: 22px; color: ${C.fg1}; }
`;

function cardHtml(card: OgCard): string {
  return (
    `<div class="card">` +
    `<img class="big" src="${svg(BIG_MARK, `fill="none" stroke="${C.line1}" stroke-width="${(16 / BIG_MARK) * 1.5}"`)}" />` +
    `<div class="top"><div class="brand"><img class="mark" src="${svg(SMALL_MARK, `fill="${C.fg0}"`)}" />` +
    `<span class="name">EXILE<span class="thin">DATA</span></span></div>` +
    `<span class="label">Path of Exile 1 &amp; 2</span></div>` +
    `<div class="body">` +
    (card.eyebrow ? `<span class="label">${escapeHtml(card.eyebrow)}</span>` : "") +
    `<div class="title">${escapeHtml(card.title)}</div>` +
    (card.description ? `<div class="desc">${escapeHtml(card.description)}</div>` : "") +
    `</div>` +
    `<div class="foot"><span class="url">${escapeHtml(card.url)}</span></div>` +
    `</div>`
  );
}

/** Geist and Geist Mono, the variable WOFF2 files the sites serve. */
export async function loadOgFonts(fontsDir: string): Promise<Font[]> {
  const [sans, mono] = await Promise.all([
    readFile(path.join(fontsDir, "geist-latin-wght-normal.woff2")),
    readFile(path.join(fontsDir, "geist-mono-latin-wght-normal.woff2"))
  ]);
  return [
    { name: "Geist", data: sans },
    { name: "Geist Mono", data: mono }
  ];
}

/** Whole sentences that fit the card's three lines; a long first sentence is cut at a word. */
export function cardDescription(text: string, max = 150): string {
  let out = "";
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    const next = out ? `${out} ${sentence}` : sentence;
    if (next.length > max) break;
    out = next;
  }
  if (out) return out;
  const cut = text.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}

export async function renderOgImage(card: OgCard, fonts: Font[]): Promise<Uint8Array> {
  const description = card.description && cardDescription(card.description);
  return render(cardHtml({ ...card, description }), {
    width: OG_WIDTH,
    height: OG_HEIGHT,
    format: "png",
    fonts,
    css: CSS
  });
}
