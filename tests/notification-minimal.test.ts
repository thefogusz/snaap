import { test } from "node:test";
import assert from "node:assert/strict";
import {
  appearanceSchema,
  demoSignal,
  renderSignal,
} from "../src/notification-format.js";
test("minimal stays text only despite stale chart settings and public image URLs", () => {
  for (const kind of ["LINE", "DISCORD", "TELEGRAM", "WEBHOOK"]) {
    const result = renderSignal(
      kind,
      demoSignal(),
      appearanceSchema.parse({ layout: "minimal", showChart: true }),
      "https://snaap.example",
      "https://snaap.example/chart.png",
    );
    assert.equal(result.image, undefined);
    assert.match(result.text, /🟢/);
    assert.equal(result.payload.embeds, undefined);
    assert.equal(result.payload.reply_markup, undefined);
    if (kind === "LINE") assert.equal(result.payload.type, "text");
    if (kind === "DISCORD") assert.equal(result.payload.flags, 4);
    if (kind === "WEBHOOK") {
      assert.equal(result.payload.presentation.chart, undefined);
      assert.equal(result.payload.presentation.image, undefined);
    }
  }
});
test("plain text uses direction and event symbols without relying on color alone", () => {
  const signal = demoSignal(),
    appearance = appearanceSchema.parse({ layout: "minimal" });
  for (const [kind, side, marker] of [
    ["ENTRY", "SHORT", "🔴"],
    ["EXIT", "LONG", "🟡"],
    ["CANCEL", "LONG", "⚪"],
    ["EXPIRED", "SHORT", "⚪"],
  ]) {
    assert.ok(
      renderSignal(
        "TELEGRAM",
        { ...signal, event: { ...signal.event, kind, side } },
        appearance,
        "http://127.0.0.1",
      ).text.includes(marker),
    );
  }
});
