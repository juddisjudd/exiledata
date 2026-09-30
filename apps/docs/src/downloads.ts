/**
 * The file browser on the Downloads page. It renders client-side from data.exiledata.dev's
 * index and manifests, so a newly published patch shows up without rebuilding the docs.
 */
export const DATA_ORIGIN = "https://data.exiledata.dev";

export const DOWNLOADS_PLACEHOLDER = "<!-- downloads-browser -->";

const SCRIPT = `
(() => {
  const root = document.getElementById("dl");
  const base = root.dataset.base;
  const GAME_NAMES = { poe2: "Path of Exile 2", poe1: "Path of Exile 1" };
  const params = new URLSearchParams(location.search);
  const state = { index: null, status: null, game: params.get("game"), version: params.get("version"), query: "" };
  const cache = new Map();

  const el = (tag, props = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat()) if (c != null && c !== false) node.append(c);
    return node;
  };
  const size = (bytes) =>
    bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + " MB" :
    bytes >= 1024 ? Math.round(bytes / 1024) + " KB" : bytes + " B";
  const count = (n) => new Intl.NumberFormat().format(n);
  const date = (iso) => new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
  const url = (path) => base + "/" + state.game + "/" + state.version + "/" + path.split("/").map(encodeURIComponent).join("/");

  const breakable = (path) =>
    path.split("/").flatMap((part, i, all) => (i < all.length - 1 ? [part + "/", el("wbr")] : [part]));

  function status(text, isError) {
    root.replaceChildren(el("p", { class: "dl-status" + (isError ? " error" : ""), role: "status", text }));
  }

  function notices() {
    const games = (state.status && state.status.games) || {};
    return Object.entries(games).map(([game, s]) => {
      const name = GAME_NAMES[game] || game;
      const tables = s.tables || [];
      const listed = tables.slice(0, 4).join(", ") + (tables.length > 4 ? " and " + (tables.length - 4) + " more" : "");
      const why = s.state === "waiting"
        ? " The patch changed the layout of some game tables" + (listed ? " (" + listed + ")" : "") +
          ", and its files wait on the community schema, dat-schema, to catch up."
        : " Publishing it failed.";
      const newest = s.published ? " The newest files here are for " + s.published + "." : "";
      return el("p", { class: "dl-notice" + (s.state === "waiting" ? "" : " error"), role: "status" },
        el("strong", { text: name + " " + s.patch + " is not published yet." }),
        why + newest + " Checked every six hours since " + date(s.since) + ".");
    });
  }

  function rows(files, paired) {
    return files.map((f) => {
      const last = f.min || f;
      return el("tr", {},
        el("td", {},
          el("a", { class: "dl-file", href: url(f.path) }, breakable(f.path)),
          f.description ? el("span", { class: "dl-desc", text: f.description }) : null),
        paired ? el("td", { class: "num", text: f.records == null ? "" : count(f.records) }) : null,
        paired ? el("td", { class: "num col-pretty" }, f.min ? el("a", { href: url(f.path), text: size(f.bytes) }) : null) : null,
        el("td", { class: "num" }, el("a", { href: url(last.path), text: size(last.bytes) })));
    });
  }

  function table(files) {
    const paired = files.some((f) => f.min);
    return el("div", { class: "table" },
      el("table", {},
        el("thead", {}, el("tr", {},
          el("th", { text: "File" }),
          paired ? [el("th", { class: "num", text: "Records" }), el("th", { class: "num col-pretty", text: ".json" }), el("th", { class: "num", text: ".min.json" })]
            : el("th", { class: "num", text: "Size" }))),
        el("tbody", {}, rows(files, paired))));
  }

  function renderFiles(manifest, box) {
    const q = state.query.trim().toLowerCase();
    const files = manifest.files.filter((f) => !q || f.path.toLowerCase().includes(q) || (f.description || "").toLowerCase().includes(q));
    const groups = [
      ["Normalized records", manifest.folders.normalized, files.filter((f) => f.folder === "normalized"), true],
      ["Game files", "One file per kind of data, as extracted from the game.", files.filter((f) => f.folder === null), true],
      ...Object.entries(manifest.folders).filter(([name]) => name !== "normalized").map(([name, description]) =>
        [name + "/", description, files.filter((f) => f.folder === name), Boolean(q)])
    ].filter(([, , list]) => list.length);

    box.replaceChildren(
      ...(files.length ? [] : [el("p", { class: "dl-status", role: "status", text: "No file matches \\u201c" + state.query + "\\u201d." })]),
      ...groups.map(([title, description, list, open]) =>
        el("details", { class: "dl-group", open },
          el("summary", {},
            el("span", { class: "dl-group-title", text: title }),
            el("span", { class: "dl-group-count", text: count(list.length) + (list.length === 1 ? " file" : " files") }),
            description ? el("span", { class: "dl-desc", text: description }) : null),
          table(list))));
  }

  async function manifestFor(game, version) {
    const key = game + "/" + version;
    if (!cache.has(key)) cache.set(key, fetch(base + "/" + key + "/manifest.json").then((r) => {
      if (!r.ok) throw new Error("manifest " + r.status);
      return r.json();
    }));
    return cache.get(key);
  }

  async function render() {
    const games = Object.keys(state.index.games).sort().reverse();
    if (!state.index.games[state.game]) state.game = games[0];
    const entry = state.index.games[state.game];
    if (!entry.versions.some((v) => v.gameVersion === state.version)) state.version = entry.latest;
    const version = entry.versions.find((v) => v.gameVersion === state.version);

    const query = new URLSearchParams({ game: state.game, version: state.version });
    history.replaceState(null, "", location.pathname + "?" + query + location.hash);

    const filesBox = el("div", { class: "dl-files" }, el("p", { class: "dl-status", text: "Loading the file list\\u2026" }));
    const search = el("input", {
      type: "search", class: "dl-search", placeholder: "Filter files", value: state.query,
      "aria-label": "Filter files",
      oninput: (e) => { state.query = e.target.value; manifestFor(state.game, state.version).then((m) => renderFiles(m, filesBox)); }
    });

    const actions = el("div", { class: "dl-actions" },
      el("a", { class: "btn primary", href: url(version.archive.path), text: "Download all JSON (" + size(version.archive.bytes) + " zip)" }),
      el("a", { class: "btn", href: url("manifest.json"), text: "manifest.json" }));

    root.replaceChildren(
      ...notices(),
      el("div", { class: "dl-controls" },
        el("div", { class: "dl-seg", role: "group", "aria-label": "Game" },
          games.map((g) => el("button", {
            type: "button", "aria-pressed": String(g === state.game), text: GAME_NAMES[g] || g,
            onclick: () => { state.game = g; state.version = null; render(); }
          }))),
        el("label", { class: "dl-patch" },
          el("span", { class: "label", text: "Patch" }),
          el("select", { onchange: (e) => { state.version = e.target.value; render(); } },
            entry.versions.map((v) => el("option", {
              value: v.gameVersion, selected: v.gameVersion === state.version,
              text: v.gameVersion + (v.gameVersion === entry.latest ? " (latest)" : "")
            })))),
        search),
      el("div", { class: "dl-summary" },
        el("div", {},
          el("p", { class: "dl-title", text: (GAME_NAMES[state.game] || state.game) + " " + state.version }),
          el("p", { class: "dl-meta", text: "Published " + date(version.generatedAt) + " \\u00b7 " + count(version.files) + " files \\u00b7 " + size(version.bytes) })),
        actions),
      filesBox);

    try {
      const manifest = await manifestFor(state.game, state.version);
      actions.append(...(manifest.trees || []).map((t) =>
        el("a", { class: "btn", href: url(t.archive.path), text: "PoB tree " + t.version + " (" + size(t.archive.bytes) + " zip)" })));
      renderFiles(manifest, filesBox);
    } catch {
      filesBox.replaceChildren(el("p", { class: "dl-status error", role: "status", text: "The file list could not be loaded. Try again, or open manifest.json directly." }));
    }
  }

  status("Loading the list of patches\\u2026");
  const publishing = fetch(base + "/status.json").then((r) => (r.ok ? r.json() : null)).catch(() => null);
  fetch(base + "/index.json")
    .then((r) => { if (!r.ok) throw new Error("index " + r.status); return r.json(); })
    .then(async (index) => {
      state.index = index;
      state.status = await publishing;
      if (!Object.keys(index.games).length) throw new Error("empty");
      return render();
    })
    .catch(() => status("The list of patches could not be loaded. It is also at " + base + "/index.json.", true));
})();
`;

export function downloadsBrowser(dataOrigin = DATA_ORIGIN): string {
  return (
    `<div id="dl" class="dl" data-base="${dataOrigin}">` +
    `<noscript><p class="dl-status">The file browser needs JavaScript. Every patch is listed at ` +
    `<a href="${dataOrigin}/index.json">${dataOrigin.replace("https://", "")}/index.json</a>.</p></noscript>` +
    `</div>\n<script>${SCRIPT}</script>\n`
  );
}
