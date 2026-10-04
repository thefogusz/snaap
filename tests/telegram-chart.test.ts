import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { telegramChartPng } from "../src/telegram-chart.js";
import { chartPng } from "../src/signal-chart.js";
import { demoSignal } from "../src/notification-format.js";

test("Telegram brand frame keeps the full chart and adds a visible logo header", async () => {
  const chart = (await chartPng(demoSignal(), "lime"))!;
  const framed = await telegramChartPng(chart, "lime");
  const metadata = await sharp(framed).metadata();
  assert.equal(metadata.width, 1024);
  const expected = await sharp(chart)
    .resize({ width: 976 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.equal(metadata.height, 84 + expected.info.height + 24);
  const actual = await sharp(framed)
    .extract({ left: 24, top: 84, width: 976, height: expected.info.height })
    .ensureAlpha()
    .raw()
    .toBuffer();
  const actualCenter = await sharp(actual, { raw: expected.info })
    .extract({
      left: 32,
      top: 32,
      width: 912,
      height: expected.info.height - 64,
    })
    .raw()
    .toBuffer();
  const expectedCenter = await sharp(expected.data, { raw: expected.info })
    .extract({
      left: 32,
      top: 32,
      width: 912,
      height: expected.info.height - 64,
    })
    .raw()
    .toBuffer();
  assert.ok(
    actualCenter.equals(expectedCenter),
    "Chart interior must stay unchanged inside the brand frame",
  );
  const header = await sharp(framed)
    .extract({ left: 24, top: 20, width: 240, height: 44 })
    .stats();
  assert.ok(header.channels[0].max > 230);
  assert.ok(header.channels[1].max > 230);
});
