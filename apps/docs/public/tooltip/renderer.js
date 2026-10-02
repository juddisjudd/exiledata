/*
 * Draws a Path of Exile tooltip on a canvas, with the header and separator art of either game.
 *
 * Based on poe2-item-canvas-renderer (https://github.com/marconett/poe2-item-canvas-renderer),
 * reworked to run in the browser and to draw a plain list of coloured lines. The header and
 * separator images and the Fontin SmallCaps font are taken from the game files and belong to
 * Grinding Gear Games.
 *
 * MIT License
 *
 * Copyright (c) 2025 Marco Nett
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
(() => {
  const COLOR = {
    grey: "#7f7f7f",
    white: "#ffffff",
    affix: "#8888ff",
    normal: "#c8c8c8",
    magic: "#8888ff",
    rare: "#ffff77",
    unique: "#af6025",
    gem: "#1ba29b",
    currency: "#aa9e82",
    flavour: "#af6025"
  };
  const FONT = "FontinSmallCaps";
  const TEXT = 17;
  const LINE = 20;
  const NAME = 21;
  // The art is the game's 4K set; this scale draws it at about 1080p size.
  const ART = 0.6;
  const PAD_X = 22;
  const MAX_TEXT = 430;
  const SEPARATOR_GAP = [5, 7];
  const PLAIN_HEADER = 40;

  const images = new Map();
  let font;

  function image(src) {
    if (!images.has(src)) {
      images.set(
        src,
        new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error("Could not load " + src));
          img.src = src;
        })
      );
    }
    return images.get(src);
  }

  function loadFont(base) {
    if (!font) {
      const face = new FontFace(FONT, "url(" + base + "/fontin-smallcaps.ttf)");
      font = face.load().then((loaded) => document.fonts.add(loaded));
    }
    return font;
  }

  /** Splits one part into lines that fit `max`, at spaces and at line breaks in the text. */
  function wrap(ctx, text, max) {
    const out = [];
    for (const para of text.split("\n")) {
      let line = "";
      for (const word of para.split(" ")) {
        const test = line ? line + " " + word : word;
        if (line && ctx.measureText(test).width > max) {
          out.push(line);
          line = word;
        } else {
          line = test;
        }
      }
      out.push(line);
    }
    return out;
  }

  /** Lays one tooltip line out as rows of coloured runs. Multi-part lines stay on one row. */
  function layoutLine(ctx, line) {
    if (line.parts.length === 1) {
      const part = line.parts[0];
      return wrap(ctx, part.text, MAX_TEXT).map((text) => [{ text, color: part.color }]);
    }
    const rows = [[]];
    for (const part of line.parts) {
      const pieces = part.text.split("\n");
      pieces.forEach((piece, i) => {
        if (i > 0) rows.push([]);
        if (piece) rows[rows.length - 1].push({ text: piece, color: part.color });
      });
    }
    return rows;
  }

  /**
   * Draws `tooltip` into `canvas` and returns where each explained line landed, in CSS pixels:
   * `[{ row, top, height }]`. `options.base` is the folder holding the art, `options.game` picks
   * the game's art.
   */
  async function render(canvas, tooltip, options) {
    const base = options.base || "/tooltip";
    const plain = tooltip.frame === "plain";
    const art = base + "/" + options.game + "/";
    const double = tooltip.frame === "rare" || tooltip.frame === "unique";
    const [left, middle, right, separator] = await Promise.all([
      loadFont(base),
      ...(plain
        ? [null, null, null, null]
        : [
            image(art + "header-" + tooltip.frame + "-left.png"),
            image(art + "header-" + tooltip.frame + "-middle.png"),
            image(art + "header-" + tooltip.frame + "-right.png"),
            image(art + "separator-" + tooltip.frame + ".png")
          ])
    ]).then((all) => all.slice(1));

    const ctx = canvas.getContext("2d");
    ctx.font = TEXT + "px " + FONT;
    const blocks = tooltip.blocks.map((block) =>
      block.map((line) => ({ row: line.row, rows: layoutLine(ctx, line) }))
    );
    const runWidth = (run) => run.reduce((w, p) => w + ctx.measureText(p.text).width, 0);

    let widest = 0;
    for (const block of blocks)
      for (const line of block)
        for (const run of line.rows) widest = Math.max(widest, runWidth(run));
    ctx.font = NAME + "px " + FONT;
    for (const name of tooltip.name)
      widest = Math.max(widest, ctx.measureText(name).width + (left ? left.width * ART * 2 : 0));

    const headerH = plain ? PLAIN_HEADER : Math.round(left.height * ART);
    const sepW = separator ? Math.round(separator.width * ART) : 0;
    const sepH = separator ? Math.max(1, Math.round(separator.height * ART)) : 1;
    const width = Math.ceil(Math.max(widest + PAD_X * 2, sepW + PAD_X, double ? 300 : 260));
    let height = headerH + 8;
    blocks.forEach((block, i) => {
      if (i > 0) height += SEPARATOR_GAP[0] + sepH + SEPARATOR_GAP[1];
      for (const line of block) height += line.rows.length * LINE;
    });
    height += 10;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingQuality = "high";

    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, width, height);

    // Header
    if (plain) {
      ctx.fillStyle = "#16130f";
      ctx.fillRect(0, 0, width, headerH);
      ctx.fillStyle = "#3a3129";
      ctx.fillRect(0, headerH - 1, width, 1);
    } else {
      const capW = left.width * ART;
      const midW = middle.width * ART;
      for (let x = capW - 1; x < width - capW; x += midW - 1)
        ctx.drawImage(middle, x, 0, midW, headerH);
      ctx.drawImage(left, 0, 0, capW, headerH);
      ctx.drawImage(right, width - right.width * ART, 0, right.width * ART, headerH);
    }
    ctx.font = NAME + "px " + FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = COLOR[tooltip.nameColor] || COLOR.white;
    const names = tooltip.name;
    names.forEach((name, i) =>
      ctx.fillText(name, width / 2, (headerH * (i + 1)) / (names.length + 1) + 1)
    );

    // Lines
    ctx.font = TEXT + "px " + FONT;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    const placed = [];
    let y = headerH + 8;
    blocks.forEach((block, i) => {
      if (i > 0) {
        y += SEPARATOR_GAP[0];
        if (separator) ctx.drawImage(separator, (width - sepW) / 2, y, sepW, sepH);
        else {
          const g = ctx.createLinearGradient(width * 0.15, 0, width * 0.85, 0);
          g.addColorStop(0, "rgba(58,49,41,0)");
          g.addColorStop(0.2, "#3a3129");
          g.addColorStop(0.8, "#3a3129");
          g.addColorStop(1, "rgba(58,49,41,0)");
          ctx.fillStyle = g;
          ctx.fillRect(width * 0.15, y, width * 0.7, 1);
        }
        y += sepH + SEPARATOR_GAP[1];
      }
      for (const line of block) {
        const top = y;
        for (const run of line.rows) {
          let x = (width - runWidth(run)) / 2;
          for (const part of run) {
            ctx.fillStyle = COLOR[part.color] || COLOR.white;
            ctx.fillText(part.text, x, y + 1);
            x += ctx.measureText(part.text).width;
          }
          y += LINE;
        }
        if (line.row) placed.push({ row: line.row, top, height: y - top });
      }
    });
    if (tooltip.nameRow) placed.unshift({ row: tooltip.nameRow, top: 0, height: headerH });
    return placed;
  }

  window.ExileTooltip = { render };
})();
