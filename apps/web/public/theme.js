// Theme switch shared by exiledata.dev and docs.exiledata.dev (the docs build copies this file).
// The choice lives in a cookie on the parent domain so it carries across the landing page, the
// docs and the admin panel; "system" means no cookie and no data-theme attribute. A small inline
// script in each page's <head> applies the cookie before first paint; this file handles clicks.
(() => {
  const COOKIE = "exiledata_theme";
  const COLORS = { light: "#f6f6f4", dark: "#0b0b0c" };
  const root = document.documentElement;
  const domain = /(^|\.)exiledata\.dev$/.test(location.hostname) ? "; Domain=exiledata.dev" : "";
  const secure = location.protocol === "https:" ? "; Secure" : "";

  const stored = () =>
    new RegExp(`(?:^|; )${COOKIE}=(light|dark)`).exec(document.cookie)?.[1] ?? "system";

  function save(choice) {
    const value =
      choice === "system" ? `${COOKIE}=; Max-Age=0` : `${COOKIE}=${choice}; Max-Age=31536000`;
    document.cookie = `${value}; Path=/; SameSite=Lax${domain}${secure}`;
  }

  function apply(choice) {
    if (choice === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", choice);

    for (const button of document.querySelectorAll("[data-theme-choice]")) {
      button.setAttribute("aria-pressed", String(button.dataset.themeChoice === choice));
    }
    for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
      meta.dataset.default ??= meta.content;
      meta.content = choice === "system" ? meta.dataset.default : COLORS[choice];
    }
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-theme-choice]");
    if (!button) return;
    save(button.dataset.themeChoice);
    apply(button.dataset.themeChoice);
  });

  apply(stored());
})();
