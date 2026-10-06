import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const context = vm.createContext({});
vm.runInContext(
  readFileSync(
    new URL("../dist/notification-overview.js", import.meta.url),
    "utf8",
  ),
  context,
);
const overview = context.notificationOverview;

function renderingContext() {
  const ctx = vm.createContext({
    window: { addEventListener() {} },
    document: { querySelector: () => ({}), addEventListener() {} },
    uiIcon: () => '<svg aria-hidden="true"></svg>',
    signalDirection: (event: { side?: string }) => event.side || "ไม่ระบุฝั่ง",
    esc: (value: unknown) =>
      String(value ?? "").replace(
        /[&<>"']/g,
        (character) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[character]!,
      ),
  });
  for (const file of ["signal-insights.js", "notification-overview.js", "notifications.js"]) {
    vm.runInContext(
      readFileSync(new URL("../dist/" + file, import.meta.url), "utf8"),
      ctx,
    );
  }
  return ctx;
}

test("current market insights remain available in collapsed details and recovery has no misleading edit action", () => {
  const ctx = renderingContext();
  const html = ctx.marketActivity({pair:"BTC/USDT",exchange:"MEXC",status:"RECOVERING",freshness:[{frame:"5m",status:"RECOVERING"}],progress:[{side:"LONG",phase:"WAITING_ENTRY",explanations:[{result:"FALSE",text:"<script>unsafe</script>"}]}]});
  assert.ok(html.includes('กำลังกู้คืนข้อมูล'));
  assert.ok(html.includes('<details class="overview-market-details">'));
  assert.ok(html.includes('5m · กำลังกู้คืนข้อมูล'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('data-notification-tab="rules"'));
});

test("attention filter removes healthy markets, successful messages and queued messages", () => {
  const ctx = renderingContext();
  vm.runInContext("notificationOverviewFilter = 'attention'", ctx);
  const html = ctx.notificationActivity(
    [
      { pair: "ADA/USDT", status: "READY" },
      { pair: "DOGE/USDT", status: "DATA_UNAVAILABLE" },
    ],
    [
      {
        destination_id: "a",
        name: "Discord",
        pair: "BTC/USDT",
        status: "UNKNOWN",
      },
      {
        destination_id: "a",
        name: "Discord",
        pair: "ETH/USDT",
        status: "SENT",
      },
      {
        destination_id: "a",
        name: "Discord",
        pair: "SOL/USDT",
        status: "PENDING",
      },
    ],
  );
  assert.match(html, /DOGE\/USDT/);
  assert.match(html, /BTC\/USDT/);
  assert.doesNotMatch(html, /ADA\/USDT|ETH\/USDT|SOL\/USDT/);
});

test("UI tags escape channel names and market labels from external data", () => {
  const ctx = renderingContext();
  assert.doesNotMatch(ctx.overviewTag("<img src=x onerror=alert(1)>"), /<img/);
  const html = ctx.overviewChannel({
    name: "<script>bad()</script>",
    kind: "DISCORD",
    sent: 1,
    pending: 0,
    attention: 0,
    rows: [],
  });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test("a thousand successful deliveries collapse into one destination summary", () => {
  const rows = Array.from({ length: 1000 }, (_, i) => ({
    id: String(i),
    destination_id: "a",
    name: "SignalGus",
    status: "SENT",
  }));
  const groups = overview.deliveryGroups(rows);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].sent, 1000);
  assert.equal(groups[0].attention, 0);
});

test("same channel names stay separate and problems sort before successful channels", () => {
  const groups = overview.deliveryGroups([
    { destination_id: "a", name: "same", status: "SENT" },
    { destination_id: "b", name: "same", status: "UNKNOWN" },
    { destination_id: "b", name: "same", status: "RETRY" },
  ]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].id, "b");
  assert.equal(groups[0].attention, 1);
  assert.equal(groups[0].pending, 1);
  assert.equal(groups[0].rows[0].status, "UNKNOWN");
});

test("waiting messages stay visible ahead of successful messages", () => {
  const groups = overview.deliveryGroups([
    ...Array.from({ length: 20 }, () => ({
      destination_id: "a",
      status: "SENT",
    })),
    { destination_id: "a", status: "RETRY" },
  ]);
  assert.equal(groups[0].rows[0].status, "RETRY");
});

test("market readiness is not confused with a trading signal", () => {
  assert.equal(
    overview.marketSummary({ status: "READY" }).label,
    "ข้อมูลพร้อม",
  );
  assert.equal(
    overview.marketSummary({
      status: "READY",
      state: { stage: -1, active: false },
    }).label,
    "รอเงื่อนไขเข้า",
  );
  assert.equal(
    overview.marketSummary({
      status: "READY",
      state: { stage: 0, active: false },
    }).label,
    "รอยืนยันขั้นที่ 1",
  );
  assert.equal(
    overview.marketSummary({ status: "READY", state: { active: true } }).label,
    "มีสัญญาณเข้าแล้ว",
  );
  assert.equal(
    overview.marketSummary({
      status: "READY",
      state: { active: false, stage: -1, latched: true },
    }).label,
    "รอเงื่อนไขรอบใหม่",
  );
  assert.equal(
    overview.marketSummary({ status: "DATA_UNAVAILABLE" }).attention,
    true,
  );
  assert.equal(overview.marketSummary({ status: "PAUSED" }).attention, false);
});
