/* The File map page: selection and the detail panel on each diagram, and the tooltip drawings. */
(() => {
  const NS = "http://www.w3.org/2000/svg";
  const esc = (s) =>
    String(s).replace(
      /[&<>"]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]
    );
  const fmt = (n) => n.toLocaleString("en-US");
  const size = (b) =>
    b >= 1e6 ? (b / 1e6).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1e3)) + " KB";
  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  for (const root of document.querySelectorAll(".fm")) setup(root);

  function setup(root) {
    const data = JSON.parse(root.querySelector(".fm-data").textContent);
    const svg = root.querySelector(".fm-graph");
    const panel = root.querySelector(".fm-panel");
    const labels = svg.querySelector(".fm-labels");
    const edgeLayer = svg.querySelector(".fm-edges");
    const edges = [...svg.querySelectorAll(".fm-edge")].map((el, i) => ({
      el,
      ...data.links[i],
      key: el.dataset.key
    }));
    const nodes = new Map([...svg.querySelectorAll(".fm-node")].map((el) => [el.dataset.id, el]));
    const examples = new Map(data.examples.map((e) => [e.id, e]));
    const state = { mode: data.examples[0] ? data.examples[0].id : "all", sel: null };

    const select = (id) => {
      state.sel = state.sel === id ? null : id;
      if (state.sel) state.mode = "all";
      apply();
    };
    const setMode = (mode) => {
      state.mode = mode;
      state.sel = null;
      apply();
    };

    for (const [id, el] of nodes) {
      el.addEventListener("click", (event) => {
        event.stopPropagation();
        select(id);
      });
      el.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          select(id);
        }
      });
    }
    svg.addEventListener("click", () => {
      if (state.sel) select(state.sel);
    });
    for (const b of root.querySelectorAll(".fm-modes button"))
      b.addEventListener("click", () => setMode(b.dataset.mode));
    for (const b of root.querySelectorAll("[data-show]")) {
      b.addEventListener("click", () => {
        setMode(b.dataset.show);
        root
          .querySelector(".fm-head")
          .scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" });
      });
    }

    const field = (f) => {
      const first = f.split(", ")[0];
      return first.length > 30 ? first.slice(0, 28) + "…" : first + (f.includes(", ") ? " …" : "");
    };

    function apply() {
      const path = !state.sel && examples.get(state.mode);
      const onE = new Set();
      const onN = new Set();
      if (state.sel) {
        onN.add(state.sel);
        for (const e of edges) {
          if (e.from === state.sel || e.to === state.sel) {
            onE.add(e.key);
            onN.add(e.from);
            onN.add(e.to);
          }
        }
      } else if (path) {
        path.path.links.forEach((k) => onE.add(k));
        Object.keys(path.path.badges).forEach((n) => onN.add(n));
      }
      const focused = Boolean(state.sel || path);
      for (const e of edges) {
        e.el.classList.toggle("on", onE.has(e.key));
        e.el.classList.toggle("dim", focused && !onE.has(e.key));
        if (onE.has(e.key)) edgeLayer.append(e.el);
      }
      for (const [id, el] of nodes) {
        el.classList.toggle("on", onN.has(id) && id !== state.sel);
        el.classList.toggle("sel", id === state.sel);
        el.classList.toggle("dim", focused && !onN.has(id));
        el.setAttribute("aria-pressed", String(id === state.sel));
      }
      labels.replaceChildren();
      if (state.sel) {
        for (const e of edges) {
          if (e.from !== state.sel) continue;
          const t = document.createElementNS(NS, "text");
          t.setAttribute("x", e.el.dataset.lx);
          t.setAttribute("y", e.el.dataset.ly);
          t.setAttribute("text-anchor", e.el.dataset.anchor);
          t.setAttribute("class", "fm-label" + (e.el.classList.contains("warn") ? " warn" : ""));
          t.textContent = field(e.field);
          labels.append(t);
        }
      }
      for (const g of svg.querySelectorAll(".fm-badges"))
        g.toggleAttribute("hidden", !path || g.dataset.path !== path.id);
      for (const b of root.querySelectorAll(".fm-modes button")) {
        b.setAttribute("aria-pressed", String(!state.sel && b.dataset.mode === state.mode));
      }
      panel.innerHTML = state.sel ? nodePanel(state.sel) : path ? pathPanel(path) : allPanel();
      for (const b of panel.querySelectorAll("[data-go]")) {
        b.addEventListener("click", () => {
          state.sel = b.dataset.go;
          state.mode = "all";
          apply();
        });
      }
    }

    const pct = (e) => {
      if (e.hit === e.total) return "100% · " + fmt(e.total);
      const p = (e.hit / e.total) * 100;
      return (
        (p >= 99.95 ? "99.9" : p.toFixed(1).replace(/\.0$/, "")) +
        "% · " +
        fmt(e.hit) +
        " of " +
        fmt(e.total)
      );
    };
    const partial = (e) => e.hit < e.total;

    function linkRow(e, out) {
      const target = out ? e.to : e.from;
      const notes = [
        e.kind === "same"
          ? "Same key in both files."
          : e.kind === "value"
            ? "Joined by value, not by a key field."
            : "",
        e.note || "",
        partial(e) && e.miss.length
          ? "Unmatched, for example " + e.miss.map((m) => "“" + m + "”").join(", ") + "."
          : ""
      ].filter(Boolean);
      return (
        '<li><button type="button" class="fm-link" data-go="' +
        esc(target) +
        '">' +
        (out
          ? "<code>" +
            esc(e.field) +
            '</code><span class="fm-arrow">→</span><span class="fm-file">' +
            esc(target) +
            "</span>"
          : '<span class="fm-file">' +
            esc(target) +
            '</span><span class="fm-arrow">·</span><code>' +
            esc(e.field) +
            "</code>") +
        '</button><span class="fm-pct' +
        (partial(e) ? " warn" : "") +
        '">' +
        pct(e) +
        "</span>" +
        notes.map((n) => '<span class="fm-note">' + esc(n) + "</span>").join("") +
        "</li>"
      );
    }

    function nodePanel(id) {
      const n = data.nodes[id];
      const out = edges.filter((e) => e.from === id);
      const inc = edges.filter((e) => e.to === id && e.from !== id);
      const count = n.folder
        ? fmt(n.count) + " files · " + fmt(n.records) + " records"
        : fmt(n.count) + (n.bytes ? " · " + size(n.bytes) + " minified" : "");
      const shape = {
        object: "Records by key",
        array: "A list of records",
        list: "A list of ids",
        folder: "A folder"
      }[n.shape];
      return (
        '<div><div><p class="label">' +
        esc(data.groups[id] || "") +
        '</p><p class="fm-title">' +
        esc(id) +
        "</p></div>" +
        (n.description ? "<p>" + esc(n.description) + "</p>" : "") +
        '<dl class="fm-kv"><dt>' +
        (n.folder ? "Contents" : "Records") +
        "</dt><dd>" +
        count +
        "</dd>" +
        "<dt>Shape</dt><dd>" +
        shape +
        "</dd>" +
        (n.trees ? "<dt>Trees</dt><dd>" + n.trees.map(esc).join(", ") + "</dd>" : "") +
        (n.sample
          ? "<dt>" +
            (n.shape === "folder" ? "For example" : "First key") +
            "</dt><dd><code>" +
            esc(n.sample) +
            "</code></dd>"
          : "") +
        "</dl></div>" +
        '<div><p class="label">Points to</p>' +
        (out.length
          ? '<ul class="fm-links">' + out.map((e) => linkRow(e, true)).join("") + "</ul>"
          : '<p class="fm-empty">No field points to another file.</p>') +
        '</div><div><p class="label">Pointed to by</p>' +
        (inc.length
          ? '<ul class="fm-links">' + inc.map((e) => linkRow(e, false)).join("") + "</ul>"
          : '<p class="fm-empty">No other file points here.</p>') +
        "</div>"
      );
    }

    function pathPanel(ex) {
      const byStep = new Map();
      for (const [file, step] of Object.entries(ex.path.badges))
        if (!byStep.has(step)) byStep.set(step, file);
      return (
        '<div><div><p class="label">Path</p><p class="fm-title">' +
        esc(ex.title) +
        "</p></div>" +
        "<p>" +
        esc(ex.subject.split(" · ")[0]) +
        ", rebuilt from these files in this order.</p>" +
        '<p class="fm-note"><a href="#' +
        data.game +
        "-" +
        ex.id +
        '">Worked example, line by line</a></p></div>' +
        '<div class="fm-wide"><ol class="fm-path">' +
        ex.steps
          .map((code, i) => {
            const file = byStep.get(i + 1);
            return (
              '<li><span class="fm-step-n">' +
              (i + 1) +
              "</span>" +
              (file
                ? '<button type="button" class="fm-link" data-go="' +
                  esc(file) +
                  '"><code>' +
                  esc(code) +
                  "</code></button>"
                : "<code>" + esc(code) + "</code>") +
              "</li>"
            );
          })
          .join("") +
        "</ol></div>"
      );
    }

    function allPanel() {
      const indeg = new Map();
      for (const e of edges) if (e.from !== e.to) indeg.set(e.to, (indeg.get(e.to) || 0) + 1);
      const top = [...indeg].sort((a, b) => b[1] - a[1]).slice(0, 5);
      const half = edges.filter(partial);
      return (
        '<div><div><p class="label">All links</p><p class="fm-title">' +
        edges.length +
        " links</p></div>" +
        "<p>" +
        (edges.length - half.length) +
        " resolve for every value. " +
        half.length +
        " leave some values unmatched.</p>" +
        '<p class="fm-note">Select a file to list its links.</p></div>' +
        '<div><p class="label">Most files point to</p><ul class="fm-links">' +
        top
          .map(
            ([id, c]) =>
              '<li><button type="button" class="fm-link" data-go="' +
              esc(id) +
              '"><span class="fm-file">' +
              esc(id) +
              '</span></button><span class="fm-pct">' +
              c +
              " files</span></li>"
          )
          .join("") +
        '</ul></div><div><p class="label">Partial links</p><ul class="fm-links">' +
        half
          .map(
            (e) =>
              '<li><button type="button" class="fm-link" data-go="' +
              esc(e.from) +
              '"><span class="fm-file">' +
              esc(e.from) +
              '</span><span class="fm-arrow">→</span><span class="fm-file">' +
              esc(e.to) +
              '</span></button><span class="fm-pct warn">' +
              pct(e) +
              "</span></li>"
          )
          .join("") +
        "</ul></div>"
      );
    }

    apply();
    drawTooltips(root, data, examples);
  }

  function drawTooltips(root, data, examples) {
    if (!window.ExileTooltip) return;
    for (const box of root.querySelectorAll(".fm-tooltip")) {
      const ex = examples.get(box.dataset.example);
      const holder = box.querySelector(".fm-canvas");
      const canvas = holder.querySelector("canvas");
      const band = holder.querySelector(".fm-band");
      const pins = holder.querySelector(".fm-pins");
      const rows = box.closest(".fm-trace").querySelectorAll(".fm-rows > li");
      window.ExileTooltip.render(canvas, ex.tooltip, { game: data.game, base: "/tooltip" })
        .then((placed) => {
          box.classList.add("drawn");
          const spots = new Map(placed.map((p) => [String(p.row), p]));
          const show = (row) => {
            const spot = spots.get(row);
            band.hidden = !spot;
            if (spot) {
              band.style.top = spot.top + "px";
              band.style.height = spot.height + "px";
            }
            for (const li of rows) li.classList.toggle("hot", li.dataset.row === row);
            for (const pin of pins.children) pin.classList.toggle("hot", pin.dataset.row === row);
          };
          const hide = () => show(null);
          pins.replaceChildren(
            ...placed.map((p) => {
              const pin = document.createElement("span");
              pin.className = "fm-pin";
              pin.dataset.row = String(p.row);
              pin.textContent = String(p.row);
              pin.style.top = p.top + p.height / 2 - 9 + "px";
              pin.addEventListener("mouseenter", () => show(String(p.row)));
              pin.addEventListener("mouseleave", hide);
              return pin;
            })
          );
          for (const li of rows) {
            li.addEventListener("mouseenter", () => show(li.dataset.row));
            li.addEventListener("mouseleave", hide);
          }
        })
        .catch(() => box.classList.remove("drawn"));
    }
  }
})();
