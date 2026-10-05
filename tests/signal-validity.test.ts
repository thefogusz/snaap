import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { signalValidUntil } from "../src/signal-validity.js";
import { buildApp } from "../src/api.js";
import type pg from "pg";

test("signals API returns expiry from the recorded revision, including paginated history", async () => {
  const owner = "00000000-0000-4000-8000-000000000001";
  const cursor = "00000000-0000-4000-8000-000000000002";
  const time = 1800000000000;
  const reads: unknown[][] = [];
  const db = {
    query: async (sql: string, values: unknown[] = []) => {
      if (sql.startsWith("SELECT user_id FROM sessions"))
        return { rows: [{ user_id: owner }], rowCount: 1 };
      if (sql.startsWith("SELECT s.*")) {
        assert.ok(
          sql.includes("rv.rule_id=s.rule_id AND rv.revision=s.revision"),
        );
        assert.ok(sql.includes("rv.spec->>'timeframe' AS setup_timeframe"));
        reads.push(values);
        return {
          rows: [
            {
              revision: 1,
              setup_timeframe: "5m",
              event: { kind: "ENTRY", time },
            },
            {
              revision: 2,
              setup_timeframe: "1h",
              event: { kind: "ENTRY", time },
            },
            { setup_timeframe: null, event: { kind: "ENTRY", time } },
            { setup_timeframe: "5m", event: { kind: "EXIT", time } },
          ],
          rowCount: 4,
        };
      }
      return { rows: [], rowCount: 0 };
    },
  } as unknown as pg.Pool;
  const { app } = await buildApp(db);
  try {
    for (const query of ["view=signals", "view=signals&before=" + cursor]) {
      const response = await app.inject({
        url: "/api/v1/signals?" + query,
        headers: { host: "127.0.0.1:4173", cookie: "snaap_session=fixture" },
      });
      assert.equal(response.statusCode, 200, response.body);
      const rows = response.json();
      assert.deepEqual(
        rows.map((row: any) => row.signal_valid_until),
        [time + 300000, time + 3600000, null, time + 300000],
      );
      assert.ok(rows.every((row: any) => !("setup_timeframe" in row)));
      assert.equal(rows[0].entry_valid_until, time + 300000);
      assert.equal(rows[3].entry_valid_until, null);
    }
    assert.equal(reads[1][1], cursor);
    assert.equal(reads[0][0], owner);
  } finally {
    await app.close();
  }
});

test("entry and exit expiry use the original candle close and revision timeframe", () => {
  const event = { kind: "ENTRY", time: 1800000000000 };
  for (const [frame, ms] of Object.entries({
    "5m": 300000,
    "15m": 900000,
    "1h": 3600000,
    "4h": 14400000,
    "1d": 86400000,
  })) {
    assert.equal(signalValidUntil(event, frame), event.time + ms);
    assert.equal(
      signalValidUntil({ ...event, kind: "EXIT" }, frame),
      event.time + ms,
    );
  }
  for (const frame of [null, undefined, "missing", "constructor"])
    assert.equal(signalValidUntil(event, frame), null);
  for (const kind of ["CANCEL", "EXPIRED"])
    assert.equal(signalValidUntil({ ...event, kind }, "5m"), null);
  for (const time of [null, "1800000000000", NaN, Infinity])
    assert.equal(signalValidUntil({ ...event, time }, "5m"), null);
});

test("entry and exit tags expire exactly at the deadline and refresh after returning to the tab", async () => {
  let now = 1000;
  let timer: (() => void) | undefined;
  let delay = 0;
  const listeners: Record<string, () => void> = {};
  const label = { textContent: "" };
  const tag = {
    dataset: { validUntil: "2000", state: "" },
    querySelector: () => label,
  };
  const document = {
    hidden: false,
    querySelector: () => ({ append() {} }),
    querySelectorAll: () => [tag],
    addEventListener: (name: string, fn: () => void) => {
      listeners[name] = fn;
    },
  };
  const context = {
    document,
    window: {
      addEventListener: (name: string, fn: () => void) => {
        listeners[name] = fn;
      },
    },
    Date: class extends Date {
      static now() {
        return now;
      }
    },
    clearTimeout: () => {
      timer = undefined;
    },
    setTimeout: (fn: () => void, ms: number) => {
      timer = fn;
      delay = ms;
      return 1;
    },
    esc: String,
    row: { event: { kind: "ENTRY" }, signal_valid_until: 2000 },
    html: "",
  };
  const source = await readFile(
    new URL("../dist/notifications.js", import.meta.url),
    "utf8",
  );
  runInNewContext(
    source + "\nhtml=signalValidityTag(row);refreshSignalValidity();",
    context,
  );
  assert.ok(context.html.includes("สัญญาณมีผล"));
  assert.equal(tag.dataset.state, "valid");
  assert.equal(delay, 1000);
  now = 2000;
  timer!();
  assert.equal(tag.dataset.state, "expired");
  assert.equal(label.textContent, "สัญญาณหมดอายุ");
  assert.equal(timer, undefined);
  context.row.event.kind = "EXIT";
  now = 1000;
  runInNewContext("html=signalValidityTag(row);", context);
  assert.ok(context.html.includes("สัญญาณมีผล"));
  now = 2000;
  runInNewContext("html=signalValidityTag(row);", context);
  assert.ok(context.html.includes("สัญญาณหมดอายุ"));
  now = 1000;
  listeners.pageshow();
  document.hidden = true;
  listeners.visibilitychange();
  assert.equal(timer, undefined);
  now = 3000;
  document.hidden = false;
  listeners.visibilitychange();
  assert.equal(tag.dataset.state, "expired");
  context.row.signal_valid_until = null as any;
  runInNewContext("html=signalValidityTag(row);", context);
  assert.equal(context.html, "");
  runInNewContext("html=signalCard(row);", context);
  assert.equal(context.html, "");
  for (const kind of ["CANCEL", "EXPIRED"]) {
    context.row.event.kind = kind;
    runInNewContext("html=signalValidityTag(row);", context);
    assert.equal(context.html, "");
  }
});
