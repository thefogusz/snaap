import { test } from "node:test";
import assert from "node:assert/strict";
import {
  appearanceSchema,
  demoSignal,
  renderSignal,
} from "../src/notification-format.js";
import { chartPng } from "../src/signal-chart.js";
test("card highlights Long/Short separately and omits visible test labels", () => {
  const appearance = appearanceSchema.parse({ layout: "card" }),
    signal = demoSignal();
  for (const side of ["LONG", "SHORT"]) {
    const output = renderSignal(
      "LINE",
      { ...signal, event: { ...signal.event, side } },
      appearance,
      "https://snaap.example",
    );
    const headline = output.payload.contents.body.contents[0];
    assert.equal(headline.contents[0].text, "BTC/USDT");
    assert.equal(
      headline.contents[1].contents[0].color,
      side === "LONG" ? "#67E2B1" : "#FF909A",
    );
    assert.match(headline.contents[1].contents[0].text, new RegExp(side));
    assert.doesNotMatch(JSON.stringify(output.payload), /ทดสอบ|\[TEST\]|DEMO/);
  }
  assert.match(
    renderSignal(
      "LINE",
      signal,
      appearanceSchema.parse({ layout: "minimal" }),
      "https://snaap.example",
    ).text,
    /\[ทดสอบ\]/,
  );
});
test("chart appearance does not change for a sample flag; context remains outside the card", async () => {
  const signal = demoSignal();
  assert.deepEqual(
    await chartPng(signal, "lime"),
    await chartPng({ ...signal, test: false }, "lime"),
  );
});
