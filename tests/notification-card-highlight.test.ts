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

test("custom LINE heading is visible inside the card while creator stays in header", () => {
  const card = renderSignal(
    "LINE",
    demoSignal(),
    appearanceSchema.parse({
      heading: "My signals",
      showCreator: true,
      creatorName: "Gus",
    }),
    "https://snaap.example",
  ).payload.contents;
  assert.equal(card.body.contents[0].text, "My signals");
  assert.equal(card.header.contents[0].contents[1].text, "snaap.me");
  assert.equal(card.header.contents[1].text, "Gus");
});

test("shared appearance reaches Discord, Telegram and custom webhook presentations", () => {
  const appearance = appearanceSchema.parse({
    heading: "My signals",
    creatorName: "Gus",
    showCreator: true,
    showPrice: false,
    accent: "violet",
  });
  const discord = renderSignal("DISCORD", demoSignal(), appearance, "").payload
    .embeds[0];
  assert.match(discord.description, /^My signals\n/);
  assert.equal(discord.footer.text, "Gus");
  assert.equal(discord.color, parseInt("C8B5FF", 16));
  assert.ok(discord.fields.every((field: any) => field.name !== "ราคาอ้างอิง"));
  const telegram = renderSignal("TELEGRAM", demoSignal(), appearance, "");
  assert.match(telegram.text, /My signals/);
  assert.match(telegram.text, /Gus$/);
  const webhook = renderSignal("WEBHOOK", demoSignal(), appearance, "").payload;
  assert.equal(webhook.presentation.heading, "My signals");
  assert.equal(webhook.presentation.signature, "Gus");
  assert.equal(webhook.presentation.brandName, "snaap.me");
  assert.ok(
    webhook.presentation.fields.every(
      (field: any) => field.key !== "referencePrice",
    ),
  );
  assert.equal(webhook.event.referencePrice, 68420.5);
});

test("Telegram photo captions use the same clean signal text as text mode", () => {
  const signal = { ...demoSignal(), test: false };
  for (const side of ["LONG", "SHORT"]) {
    const item = { ...signal, event: { ...signal.event, side } };
    const card = renderSignal(
      "TELEGRAM",
      item,
      appearanceSchema.parse({
        layout: "card",
        showCreator: true,
        creatorName: "Gus",
      }),
      "https://snaap.example",
    );
    const plain = renderSignal(
      "TELEGRAM",
      item,
      appearanceSchema.parse({
        layout: "minimal",
        showCreator: true,
        creatorName: "Gus",
      }),
      "https://snaap.example",
    );
    assert.equal(card.text, plain.text);
    assert.match(card.text, side === "LONG" ? /🟢/ : /🔴/);
  }
});
