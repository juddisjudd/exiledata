/* The Downloads page's JSON viewer: it streams a file, indexes its lines and draws only those in view. */
(() => {
  // Browsers cap an element's height, so past this the scrollbar maps to lines proportionally.
  const MAX_HEIGHT = 1e7;
  const BLOCK = 1 << 20;
  const OVERSCAN = 40;
  const MAX_LINE = 10000;
  const MAX_HITS = 100000;
  const TOKEN =
    /("[^"\\]*(?:\\.[^"\\]*)*")(\s*:)?|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null|[{}[\],:]/g;
  const LITERALS = new Set(["true", "false", "null"]);
  const STEPS = { ArrowDown: 40, ArrowUp: -40, Home: -Infinity, End: Infinity };

  const esc = (s) =>
    s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
  const span = (cls, text) => '<span class="' + cls + '">' + esc(text) + "</span>";
  const size = (bytes) =>
    bytes >= 1048576
      ? (bytes / 1048576).toFixed(1) + " MB"
      : bytes >= 1024
        ? Math.round(bytes / 1024) + " KB"
        : bytes + " B";
  const count = (n) => new Intl.NumberFormat().format(n);
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const pattern = (query) => new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");

  let ui = null;
  let job = null;
  let frame = 0;
  let lineHeight = 20;
  let searchTimer = 0;

  // `marks` holds [start, end) pairs of search hits; `current` is the start of the selected hit.
  function highlight(line, marks, current) {
    let out = "";
    let r = 0;
    const emit = (cls, from, to) => {
      for (let pos = from; pos < to;) {
        while (r < marks.length && marks[r + 1] <= pos) r += 2;
        const hit = r < marks.length && marks[r] <= pos;
        const end = r < marks.length ? Math.min(to, hit ? marks[r + 1] : marks[r]) : to;
        const text = line.slice(pos, end);
        const piece = cls ? span(cls, text) : esc(text);
        out += hit
          ? "<mark" + (marks[r] === current ? ' class="cur"' : "") + ">" + piece + "</mark>"
          : piece;
        pos = end;
      }
    };
    let last = 0;
    TOKEN.lastIndex = 0;
    for (let m = TOKEN.exec(line); m; m = TOKEN.exec(line)) {
      emit("", last, m.index);
      const t = m[0];
      if (m[1]) {
        emit(m[2] ? "k" : "s", m.index, m.index + m[1].length);
        if (m[2]) emit("p", m.index + m[1].length, TOKEN.lastIndex);
      } else {
        const cls = LITERALS.has(t) ? "b" : t.length === 1 && "{}[],:".includes(t) ? "p" : "n";
        emit(cls, m.index, TOKEN.lastIndex);
      }
      last = TOKEN.lastIndex;
    }
    emit("", last, line.length);
    return out;
  }

  function lineAt(j, i) {
    let lo = 0;
    let hi = j.blocks.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (j.blocks[mid].first <= i) lo = mid;
      else hi = mid - 1;
    }
    const b = j.blocks[lo];
    const k = i - b.first;
    const start = b.starts[k];
    let end = k + 1 < b.starts.length ? b.starts[k + 1] : b.text.length;
    if (b.text.charCodeAt(end - 1) === 10) end--;
    if (end > start && b.text.charCodeAt(end - 1) === 13) end--;
    return b.text.slice(start, end);
  }

  function row(j, i) {
    const full = lineAt(j, i);
    const text = full.length > MAX_LINE ? full.slice(0, MAX_LINE) : full;
    const marks = [];
    if (j.find) {
      j.find.lastIndex = 0;
      for (let m = j.find.exec(text); m; m = j.find.exec(text)) {
        marks.push(m.index, m.index + m[0].length);
      }
    }
    const current = j.hits && j.cur >= 0 && j.hits.lines[j.cur] === i ? j.hits.cols[j.cur] : -1;
    let code = highlight(text, marks, current);
    if (full.length > MAX_LINE) {
      code +=
        '<span class="jv-cut"> \u2026 ' + count(full.length - MAX_LINE) + " more characters</span>";
    }
    return '<div><span class="jv-ln">' + (i + 1) + "</span>" + code + "</div>";
  }

  function search(j, fromLine, reveal) {
    window.clearTimeout(searchTimer);
    searchTimer = 0;
    const query = ui.find.value;
    j.find = query ? pattern(query) : null;
    j.hits = null;
    j.cur = -1;
    j.first = -1;
    if (j.find) {
      const lines = [];
      const cols = [];
      let capped = false;
      scan: for (const b of j.blocks) {
        let k = 0;
        j.find.lastIndex = 0;
        for (let m = j.find.exec(b.text); m; m = j.find.exec(b.text)) {
          while (k + 1 < b.starts.length && b.starts[k + 1] <= m.index) k++;
          lines.push(b.first + k);
          cols.push(m.index - b.starts[k]);
          if (lines.length === MAX_HITS) {
            capped = true;
            break scan;
          }
        }
      }
      j.hits = { lines, cols, capped };
      if (lines.length) {
        let lo = 0;
        let hi = lines.length;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (lines[mid] < fromLine) lo = mid + 1;
          else hi = mid;
        }
        j.cur = lo % lines.length;
        if (reveal) revealHit(j);
      }
    }
    schedule();
  }

  function revealHit(j) {
    const g = geometry(j);
    const top = j.hits.lines[j.cur] * lineHeight;
    if (top < j.pos || top + lineHeight > j.pos + g.view) {
      const pos = clamp(top - (g.view - lineHeight) / 2, 0, g.span);
      if (g.scaled) j.pos = pos;
      else ui.scroller.scrollTop = pos;
    }
    j.reveal = true;
    j.first = -1;
    schedule();
  }

  function step(dir) {
    const j = job;
    if (!j || !j.hits || !j.hits.lines.length) return;
    const n = j.hits.lines.length;
    j.cur = (j.cur + dir + n) % n;
    revealHit(j);
  }

  function revealColumn() {
    const mark = ui.lines.querySelector("mark.cur");
    if (!mark) return;
    const { scroller } = ui;
    const gutter = mark.parentElement.firstElementChild.offsetWidth + 12;
    const left = mark.offsetLeft;
    const right = left + mark.offsetWidth;
    if (left < scroller.scrollLeft + gutter || right > scroller.scrollLeft + scroller.clientWidth) {
      scroller.scrollLeft = Math.max(0, left - gutter - 40);
    }
  }

  function index(j, text) {
    const starts = [0];
    let longest = j.longest;
    let prev = 0;
    for (let i = text.indexOf("\n"); i !== -1; i = text.indexOf("\n", i + 1)) {
      if (i - prev > longest) longest = i - prev;
      prev = i + 1;
      if (prev < text.length) starts.push(prev);
    }
    if (text.length - prev > longest) longest = text.length - prev;
    j.blocks.push({ first: j.lines, text, starts: Uint32Array.from(starts) });
    j.lines += starts.length;
    j.longest = longest;
  }

  async function load(j) {
    const res = await window.fetch(j.options.src, { signal: j.controller.signal });
    if (!res.ok || !res.body) throw new Error("HTTP " + res.status);
    const reader = res.body.getReader();
    const decoder = new window.TextDecoder();
    let pending = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      j.loaded += value.byteLength;
      pending += decoder.decode(value, { stream: true });
      if (pending.length >= BLOCK) {
        const cut = pending.lastIndexOf("\n") + 1;
        if (cut) {
          index(j, pending.slice(0, cut));
          pending = pending.slice(cut);
        }
      }
      schedule();
    }
    pending += decoder.decode();
    if (pending) index(j, pending);
    j.done = true;
    if (j.find) {
      search(j, j.cur >= 0 ? j.hits.lines[j.cur] : Math.floor(j.pos / lineHeight), false);
    }
    schedule();
  }

  function geometry(j) {
    const full = j.lines * lineHeight;
    const height = Math.min(full, MAX_HEIGHT);
    const view = ui.scroller.clientHeight;
    return {
      height,
      view,
      scaled: full > height,
      span: Math.max(0, full - view),
      track: Math.max(0, height - view)
    };
  }

  const toPos = (g, top) => (g.scaled && g.track ? (top / g.track) * g.span : top);
  const toTop = (g, pos) => (g.scaled && g.span ? (pos / g.span) * g.track : pos);

  function status(j) {
    const o = j.options;
    const state = j.failed
      ? "Could not be loaded"
      : j.done
        ? count(j.lines) + " lines"
        : "Loading " + size(j.loaded) + (o.bytes ? " of " + size(o.bytes) : "");
    ui.meta.textContent = [o.meta, state].filter(Boolean).join(" \u00b7 ");
    ui.progress.hidden = j.done || j.failed;
    ui.bar.style.width = o.bytes ? Math.min(100, (j.loaded / o.bytes) * 100) + "%" : "0";
    ui.error.hidden = !j.failed;
    const h = j.hits;
    ui.count.textContent = !h
      ? ""
      : !h.lines.length
        ? "No matches"
        : count(j.cur + 1) + " of " + count(h.lines.length) + (h.capped || !j.done ? "+" : "");
  }

  function schedule() {
    if (!frame) frame = window.requestAnimationFrame(draw);
  }

  function draw() {
    frame = 0;
    const j = job;
    if (!j) return;
    status(j);
    const { scroller, space, lines } = ui;
    const g = geometry(j);
    const digits = Math.max(4, String(j.lines).length);
    space.style.height = g.height + "px";
    space.style.width = "calc(" + (digits + Math.min(j.longest, MAX_LINE)) + "ch + 64px)";
    lines.style.setProperty("--jv-digits", digits);

    if (g.scaled) {
      j.pos = clamp(j.pos, 0, g.span);
      const top = toTop(g, j.pos);
      if (Math.abs(scroller.scrollTop - top) >= 1) {
        scroller.scrollTop = top;
        j.setTop = scroller.scrollTop;
      }
    } else {
      j.pos = scroller.scrollTop;
    }

    const first = Math.max(0, Math.floor(j.pos / lineHeight) - OVERSCAN);
    const last = Math.min(j.lines, Math.ceil((j.pos + g.view) / lineHeight) + OVERSCAN);
    const offset = Math.round(scroller.scrollTop + first * lineHeight - j.pos);
    lines.style.transform = "translateY(" + offset + "px)";
    if (first === j.first && last === j.last) return;
    j.first = first;
    j.last = last;
    let html = "";
    for (let i = first; i < last; i++) html += row(j, i);
    lines.innerHTML = html;
    if (j.reveal) {
      j.reveal = false;
      revealColumn();
    }
  }

  function onScroll() {
    const j = job;
    if (!j) return;
    if (ui.scroller.scrollTop === j.setTop) j.setTop = -1;
    else j.pos = toPos(geometry(j), ui.scroller.scrollTop);
    schedule();
  }

  // Past MAX_HEIGHT a pixel of scrollbar spans many lines, so wheel and keys move by lines instead.
  function onWheel(e) {
    const j = job;
    if (!j || e.ctrlKey) return;
    const g = geometry(j);
    if (!g.scaled) return;
    e.preventDefault();
    const unit = e.deltaMode === 1 ? lineHeight : e.deltaMode === 2 ? g.view : 1;
    const sideways = e.shiftKey && !e.deltaX;
    ui.scroller.scrollLeft += (sideways ? e.deltaY : e.deltaX) * unit;
    if (!sideways) j.pos = clamp(j.pos + e.deltaY * unit, 0, g.span);
    schedule();
  }

  function onKey(e) {
    const j = job;
    if (!j || e.altKey || e.ctrlKey || e.metaKey) return;
    const g = geometry(j);
    if (!g.scaled) return;
    const delta =
      e.key === "PageDown"
        ? g.view - lineHeight
        : e.key === "PageUp"
          ? lineHeight - g.view
          : STEPS[e.key];
    if (delta === undefined) return;
    e.preventDefault();
    j.pos = clamp(j.pos + delta, 0, g.span);
    schedule();
  }

  function build() {
    const dialog = document.createElement("dialog");
    dialog.className = "jv";
    dialog.setAttribute("aria-labelledby", "jv-title");
    dialog.innerHTML =
      '<div class="jv-bar">' +
      '<div class="jv-head"><p class="jv-title" id="jv-title"></p><p class="jv-meta"></p></div>' +
      '<div class="jv-find">' +
      '<input type="search" placeholder="Find" aria-label="Find in file" spellcheck="false" autocomplete="off" />' +
      '<span class="jv-count" aria-live="polite"></span>' +
      '<button type="button" class="jv-step jv-prev" aria-label="Previous match" title="Previous match (Shift+Enter)"></button>' +
      '<button type="button" class="jv-step jv-next" aria-label="Next match" title="Next match (Enter)"></button>' +
      "</div>" +
      '<div class="jv-actions"></div>' +
      '<button type="button" class="btn jv-close">Close</button>' +
      "</div>" +
      '<div class="jv-progress"><span></span></div>' +
      '<p class="jv-error" role="status" hidden>The file could not be loaded. Download it instead.</p>' +
      '<div class="jv-scroll" tabindex="0" role="region" aria-label="File contents">' +
      '<div class="jv-space"><div class="jv-lines"></div></div></div>';
    document.body.append(dialog);
    const q = (s) => dialog.querySelector(s);
    ui = {
      dialog,
      title: q(".jv-title"),
      meta: q(".jv-meta"),
      actions: q(".jv-actions"),
      progress: q(".jv-progress"),
      bar: q(".jv-progress span"),
      error: q(".jv-error"),
      scroller: q(".jv-scroll"),
      space: q(".jv-space"),
      lines: q(".jv-lines"),
      find: q(".jv-find input"),
      count: q(".jv-count")
    };
    q(".jv-close").addEventListener("click", () => dialog.close());
    q(".jv-prev").addEventListener("click", () => step(-1));
    q(".jv-next").addEventListener("click", () => step(1));
    const searchFromView = () => {
      if (job) search(job, Math.floor(job.pos / lineHeight), true);
    };
    ui.find.addEventListener("input", () => {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(searchFromView, 150);
    });
    ui.find.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (searchTimer) searchFromView();
        else step(e.shiftKey ? -1 : 1);
      } else if (e.key === "Escape" && ui.find.value) {
        e.preventDefault();
        ui.find.value = "";
        searchFromView();
      }
    });
    dialog.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        ui.find.focus();
        ui.find.select();
      }
    });
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) dialog.close();
    });
    dialog.addEventListener("close", () => {
      const j = job;
      stop();
      if (j && j.options.onclose) j.options.onclose();
    });
    ui.scroller.addEventListener("scroll", onScroll, { passive: true });
    ui.scroller.addEventListener("wheel", onWheel, { passive: false });
    ui.scroller.addEventListener("keydown", onKey);
    window.addEventListener("resize", schedule);
  }

  function stop() {
    window.clearTimeout(searchTimer);
    searchTimer = 0;
    if (!job) return;
    job.controller.abort();
    job = null;
    ui.lines.innerHTML = "";
  }

  function open(options) {
    if (!ui) build();
    stop();
    const j = {
      options,
      controller: new window.AbortController(),
      blocks: [],
      lines: 0,
      longest: 0,
      loaded: 0,
      done: false,
      failed: false,
      pos: 0,
      setTop: -1,
      first: -1,
      last: -1,
      find: null,
      hits: null,
      cur: -1,
      reveal: false
    };
    job = j;
    ui.find.value = "";
    ui.title.textContent = options.title;
    ui.actions.replaceChildren(
      ...options.links.map((link) => {
        const a = document.createElement("a");
        a.className = "btn";
        a.href = link.href;
        a.textContent = link.text;
        return a;
      })
    );
    ui.scroller.scrollTop = 0;
    ui.scroller.scrollLeft = 0;
    status(j);
    if (!ui.dialog.open) ui.dialog.showModal();
    lineHeight = parseFloat(window.getComputedStyle(ui.lines).lineHeight) || 20;
    ui.scroller.focus({ focusVisible: false });
    load(j).catch(() => {
      if (job !== j) return;
      j.failed = true;
      schedule();
    });
  }

  function close() {
    if (ui && ui.dialog.open) ui.dialog.close();
  }

  window.jsonViewer = { open, close };
})();
