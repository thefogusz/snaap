import { test } from "node:test";
import assert from "node:assert/strict";
import { captureChart, chartPng, chartToken } from "../src/signal-chart.js";
import {
  appearanceSchema,
  demoSignal,
  renderSignal,
} from "../src/notification-format.js";
test("chart snapshot excludes future and invalid candles and bounds image generation", async () => {
  const bars = Array.from({ length: 80 }, (_, i) => ({
    time: 1000 + i * 1000,
    open: 100 + i,
    high: 103 + i,
    low: 99 + i,
    close: 102 + i,
    volume: 1,
  }));
  const chart = captureChart(bars, 60000, "1h");
  assert.equal(chart!.candles.length, 60);
  assert.equal(chart!.candles.at(-1)!.time, 60000);
  assert.equal(captureChart([{ ...bars[0], high: 0 }], 1000, "1h"), undefined);
  const png = await chartPng({ ...demoSignal(), chart }, "lime");
  assert.deepEqual([...png!.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
});
test("creator names are optional and disclaimer is absent in all formats", () => {
  for (const kind of ["TELEGRAM", "LINE", "DISCORD", "WEBHOOK"]) {
    const appearance = appearanceSchema.parse({
      showCreator: true,
      creatorName: "My signals",
    });
    const result = renderSignal(
      kind,
      demoSignal(),
      appearance,
      "https://snaap.example",
    );
    assert.match(result.text, /My signals/);
    assert.equal(result.signature, "My signals");
    assert.doesNotMatch(JSON.stringify(result), /Created by|สร้างโดย/);
    assert.equal(
      result.fields.some((field) => field.value === "My signals"),
      false,
    );
    if (kind === "LINE")
      assert.equal(
        result.payload.contents.header.contents.find(
          (item: any) => item.text === "My signals",
        ).align,
        "end",
      );
    assert.doesNotMatch(
      JSON.stringify(result),
      /No trade executed|ไม่ได้ส่งออเดอร์|สัญญาณเท่านั้น/,
    );
    const hidden = renderSignal(
      kind,
      demoSignal(),
      appearanceSchema.parse({ creatorName: "Hidden name" }),
      "https://snaap.example",
    );
    assert.doesNotMatch(JSON.stringify(hidden), /Hidden name/);
  }
});
test("chart access token is bound to signal id and accent", () => {
  const secret = "a".repeat(64);
  assert.notEqual(
    chartToken("one", "lime", secret),
    chartToken("two", "lime", secret),
  );
  assert.notEqual(
    chartToken("one", "lime", secret),
    chartToken("one", "cyan", secret),
  );
});
