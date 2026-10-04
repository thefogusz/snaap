import { test } from "node:test";
import assert from "node:assert/strict";
import {
  appearanceSchema,
  renderSignal,
  demoSignal,
} from "../src/notification-format.js";

test("minimal messages retain identity, direction, event and Snaap even with optional fields hidden", () => {
  const output = renderSignal(
    "TELEGRAM",
    demoSignal(),
    appearanceSchema.parse({
      layout: "minimal",
      showPrice: false,
      showSetup: false,
      showTime: false,
      showId: false,
    }),
    "http://127.0.0.1:4173",
  );
  assert.match(output.text, /BTC\/USDT/);
  assert.match(output.text, /Long/);
  assert.match(output.text, /สัญญาณเข้า/);
  assert.match(output.text, /Snaap/);
  assert.doesNotMatch(output.text, /localhost|127\.0\.0\.1|ราคาอ้างอิง/);
});
test("LINE card is a Flex bubble and falls back to text when minimal is selected", () => {
  const card = renderSignal(
    "LINE",
    demoSignal(),
    appearanceSchema.parse({}),
    "https://snaap.example",
  );
  assert.equal(card.payload.type, "flex");
  assert.equal(card.payload.contents.type, "bubble");
  assert.equal(
    card.payload.contents.hero.url,
    "https://snaap.example/assets/snaap-signal-banner.png",
  );
  const minimal = renderSignal(
    "LINE",
    demoSignal(),
    appearanceSchema.parse({ layout: "minimal" }),
    "http://127.0.0.1:4173",
  );
  assert.equal(minimal.payload.type, "text");
});
test("Discord never pings users and webhooks preserve structured evidence regardless of appearance", () => {
  const discord = renderSignal(
    "DISCORD",
    { ...demoSignal(), setup_name: "@everyone **breakout**" },
    appearanceSchema.parse({}),
    "https://snaap.example",
  );
  assert.deepEqual(discord.payload.allowed_mentions, { parse: [] });
  assert.equal(discord.payload.embeds.length, 1);
  const webhook = renderSignal(
    "WEBHOOK",
    demoSignal(),
    appearanceSchema.parse({ showPrice: false }),
    "http://127.0.0.1:4173",
  );
  assert.equal(webhook.payload.event.referencePrice, 68420.5);
  assert.equal(webhook.payload.type, "snaap.signal");
});
test("appearance rejects arbitrary colors, unknown properties and oversized headings", () => {
  assert.throws(() =>
    appearanceSchema.parse({ accent: "url(javascript:alert(1))" }),
  );
  assert.throws(() => appearanceSchema.parse({ botToken: "secret" }));
  assert.throws(() => appearanceSchema.parse({ heading: "x".repeat(61) }));
});
