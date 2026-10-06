import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import type pg from "pg";
import { buildApp } from "../src/api.js";

const source = await readFile(new URL("../dist/router.js", import.meta.url), "utf8");
function fixture(url: string) {
  const listeners = new Map<string, Function>();
  const entries = [new URL(url)];
  let index = 0;
  const window = {
    addEventListener: (name: string, fn: Function) => listeners.set(name, fn),
    dispatchEvent: (event: Event) => listeners.get(event.type)?.(event),
  };
  const context = vm.createContext({
    window, URL, Event, queueMicrotask,
    get location() { return entries[index]; },
    history: {
      replaceState: (_state: unknown, _title: string, path: string) => { entries[index] = new URL(path, entries[index]); },
      pushState: (_state: unknown, _title: string, path: string) => { entries.splice(index + 1); entries.push(new URL(path, entries[index])); index++; },
    },
  });
  vm.runInContext(source, context);
  return {
    router: context.window.SnaapRouter,
    url: () => entries[index], listeners,
    back: () => { index--; listeners.get("popstate")?.(); },
    forward: () => { index++; listeners.get("popstate")?.(); },
  };
}

test("legacy page bookmarks migrate without losing query parameters or adding history", () => {
  const f = fixture("https://snaap.me/?import=code#notifications");
  assert.equal(f.url().href, "https://snaap.me/notifications?import=code");
  assert.equal(f.router.current(), "notifications");
  const root = fixture("https://snaap.me/");
  assert.equal(root.url().pathname, "/home");
});

test("page navigation supports back, forward and same-page clicks", async () => {
  const f = fixture("https://snaap.me/home");
  const rendered: string[] = [];
  f.listeners.set("snaap:navigate", () => rendered.push(f.router.current()));
  f.router.go("history");
  await Promise.resolve();
  assert.equal(f.url().pathname, "/history");
  assert.equal(f.url().hash, "");
  f.back(); f.forward();
  f.router.go("history");
  await Promise.resolve();
  assert.deepEqual(rendered, ["history", "home", "history", "history"]);
});

test("normal app links route locally while modified clicks and SVG anchors keep native behavior", async () => {
  const f = fixture("https://snaap.me/home");
  let prevented = 0;
  const click = (href: string, ctrlKey = false) => f.listeners.get("click")?.({
    button: 0, ctrlKey, preventDefault: () => prevented++,
    target: { closest: () => ({ href, target: "", hasAttribute: () => false }) },
  });
  click("https://snaap.me/history", true);
  click("https://snaap.me/home#i-chat");
  assert.equal(prevented, 0);
  click("https://snaap.me/notifications");
  await Promise.resolve();
  assert.equal(prevented, 1);
  assert.equal(f.url().pathname, "/notifications");
});

test("direct app page requests serve the shell; unknown APIs and files remain 404", async () => {
  const db = { query: async () => ({ rows: [], rowCount: 0 }) } as unknown as pg.Pool;
  const { app } = await buildApp(db);
  try {
    for (const view of ["home", "notifications", "history", "watch", "billing"]) {
      const response = await app.inject({ url: `/${view}`, headers: { host: "127.0.0.1:4173" } });
      assert.equal(response.statusCode, 200, view);
      assert.match(response.body, /src="\/router.js"/);
      const slash = await app.inject({ url: `/${view}/?import=code`, headers: { host: "127.0.0.1:4173" } });
      assert.equal(slash.headers.location, `/${view}?import=code`);
    }
    for (const url of ["/missing.js", "/api/unknown", "/unknown-page"]) {
      const response = await app.inject({ url, headers: { host: "127.0.0.1:4173" } });
      assert.equal(response.statusCode, 404);
    }
  } finally { await app.close(); }
});
