import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sendNotification } from "../src/notification-send.js";
import { demoSignal } from "../src/notification-format.js";

test("LINE sends Flex with stable retry key; Telegram sends minimal text or branded photo without paid broadcasts", async () => {
  const original = globalThis.fetch,
    beforeLine = process.env.LINE_ACCESS_TOKEN,
    beforeTelegram = process.env.TELEGRAM_BOT_TOKEN,
    beforeKey = process.env.DATA_ENCRYPTION_KEY;
  process.env.LINE_ACCESS_TOKEN = "fixture-token";
  process.env.TELEGRAM_BOT_TOKEN = "fixture-token";
  process.env.DATA_ENCRYPTION_KEY = "a".repeat(64);
  const requests: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), init: init! });
    return new Response(
      JSON.stringify({ ok: true, result: { message_id: 12 } }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  try {
    const id = randomUUID(),
      base = {
        id: randomUUID(),
        owner_id: randomUUID(),
        config: { recipient: "fixture-recipient" },
        verified: true,
      };
    assert.equal(
      (
        await sendNotification(
          { ...base, kind: "LINE", appearance: { layout: "card" } },
          demoSignal(),
          id,
          "https://snaap.example",
        )
      ).status,
      "SENT",
    );
    const line = requests.at(-1)!;
    assert.equal((line.init.headers as any)["X-Line-Retry-Key"], id);
    assert.equal(JSON.parse(line.init.body as string).messages[0].type, "flex");
    await sendNotification(
      { ...base, kind: "TELEGRAM", appearance: {} },
      demoSignal(),
      id,
    );
    assert.ok(requests.at(-1)!.url.endsWith("/sendMessage"));
    assert.equal(
      JSON.parse(requests.at(-1)!.init.body as string).allow_paid_broadcast,
      undefined,
    );
    await sendNotification(
      {
        ...base,
        kind: "TELEGRAM",
        appearance: { layout: "card", accent: "cyan" },
      },
      demoSignal(),
      id,
    );
    const photo = requests.at(-1)!;
    assert.ok(photo.url.endsWith("/sendPhoto"));
    assert.ok(photo.init.body instanceof FormData);
    assert.equal(
      (photo.init.body as FormData).get("chat_id"),
      "fixture-recipient",
    );
    assert.ok(((photo.init.body as FormData).get("photo") as Blob).size > 1000);
    await sendNotification(
      {
        ...base,
        kind: "TELEGRAM",
        appearance: {
          layout: "card",
          showChart: true,
          showCreator: true,
          creatorName: "Gus Signals",
        },
      },
      demoSignal(),
      id,
    );
    const chartPhoto = requests.at(-1)!;
    assert.ok(chartPhoto.url.endsWith("/sendPhoto"));
    const chartBody = chartPhoto.init.body as FormData;
    assert.match(String(chartBody.get("caption")), /Gus Signals/);
    const png = Buffer.from(
      await (chartBody.get("photo") as Blob).arrayBuffer(),
    );
    assert.deepEqual(
      [...png.subarray(0, 8)],
      [137, 80, 78, 71, 13, 10, 26, 10],
    );
    await sendNotification(
      {
        ...base,
        kind: "LINE",
        appearance: { layout: "card", showChart: true },
      },
      demoSignal(),
      id,
      "https://snaap.example",
    );
    const hero = JSON.parse(requests.at(-1)!.init.body as string).messages[0]
      .contents.hero;
    assert.match(hero.url, /\/signal-charts\/demo-/);
    assert.equal(hero.aspectRatio, "5:3");
    await sendNotification(
      {
        ...base,
        kind: "LINE",
        appearance: { layout: "minimal", showChart: true },
      },
      demoSignal(),
      id,
      "https://snaap.example",
    );
    assert.deepEqual(
      JSON.parse(requests.at(-1)!.init.body as string).messages.map(
        (m: any) => m.type,
      ),
      ["text"],
    );
    await sendNotification(
      {
        ...base,
        kind: "TELEGRAM",
        appearance: { layout: "minimal", showChart: true },
      },
      demoSignal(),
      id,
    );
    assert.ok(requests.at(-1)!.url.endsWith("/sendMessage"));
    const minimal = JSON.parse(requests.at(-1)!.init.body as string);
    assert.match(minimal.text, /🟢/);
    assert.equal(minimal.reply_markup, undefined);
  } finally {
    globalThis.fetch = original;
    if (beforeLine === undefined) delete process.env.LINE_ACCESS_TOKEN;
    else process.env.LINE_ACCESS_TOKEN = beforeLine;
    if (beforeTelegram === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = beforeTelegram;
    if (beforeKey === undefined) delete process.env.DATA_ENCRYPTION_KEY;
    else process.env.DATA_ENCRYPTION_KEY = beforeKey;
  }
});
