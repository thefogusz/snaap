"use strict";
// Shared by navigation links and companion scripts; only app pages are routed.
(() => {
  const views = new Set(["home", "sentiment", "notifications", "history", "watch", "billing"]);
  function current() {
    const legacy = location.hash.slice(1);
    if (views.has(legacy)) return legacy;
    const view = location.pathname.replace(/^\/|\/$/g, "");
    return views.has(view) ? view : "home";
  }
  function replace(view) {
    history.replaceState(null, "", "/" + view + location.search);
  }
  function go(view) {
    if (!views.has(view)) return;
    if (location.pathname !== "/" + view || location.hash)
      history.pushState(null, "", "/" + view + location.search);
    // Match hash navigation timing so the initiating handler can finish first.
    queueMicrotask(() => window.dispatchEvent(new Event("snaap:navigate")));
  }
  window.SnaapRouter = { current, go, replace };
  if (views.has(location.hash.slice(1)) || location.pathname === "/" || location.pathname === "/index.html")
    replace(current());
  window.addEventListener("popstate", () => window.dispatchEvent(new Event("snaap:navigate")));
  window.addEventListener("hashchange", () => {
    if (!views.has(location.hash.slice(1))) return;
    replace(current());
    window.dispatchEvent(new Event("snaap:navigate"));
  });
  window.addEventListener("click", event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest("a[href]");
    if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
    const url = new URL(link.href, location.href);
    const view = url.pathname.slice(1);
    if (url.origin !== location.origin || url.search || url.hash || !views.has(view)) return;
    event.preventDefault();
    go(view);
  });
})();
