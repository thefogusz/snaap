import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

test("expired cards escape reasons, retain legacy names and stay out of the signal inbox and status view", async () => {
  const view = { innerHTML: "" };
  const row = {
    pair: "QNT/USDT",
    exchange: "MEXC",
    setup_name: "Original setup",
    event: {
      kind: "EXPIRED",
      side: "LONG",
      time: 1791189300000,
      referencePrice: 252.52,
      evidence: { reason: '<img src=x onerror="alert(1)">' },
    },
  };
  const context = {
    document: { querySelector: () => ({ append() {} }), querySelectorAll: () => [], addEventListener() {} },
    window: { addEventListener() {} },
    clearTimeout() {},
    $: () => view,
    esc: (value: unknown) =>
      String(value).replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c]!,
      ),
    uiIcon: () => "",
    signalDirection: () => "Long",
    row,
    html: "",
  };
  const source = await readFile(
    new URL("../dist/notifications.js", import.meta.url),
    "utf8",
  );
  runInNewContext(source + `\nhtml=signalCard(row);`, context);
  assert.ok(context.html.includes("&lt;img"));
  assert.ok(!context.html.includes("<img"));
  assert.ok(context.html.includes('title="Original setup · &lt;img'));
  row.event.evidence.reason = "หมดเวลารอ";
  runInNewContext("html=signalCard(row);", context);
  assert.ok(context.html.includes("เซตอัป: Original setup"));
  runInNewContext(
    `notificationData={signals:[],statusSignals:[row],channels:{},deliveries:[],monitor:[]};notificationSection='inbox';paintNotifications();`,
    context,
  );
  assert.ok(!view.innerHTML.includes('data-signal-kind="EXPIRED"'));
  runInNewContext(
    `notificationSection='activity';paintNotifications();`,
    context,
  );
  assert.ok(!view.innerHTML.includes('data-signal-kind="EXPIRED"'));
  assert.ok(view.innerHTML.includes("สถานะข้อมูลตลาด"));
  assert.ok(view.innerHTML.includes("ประวัติการส่งข้อความ"));
});
