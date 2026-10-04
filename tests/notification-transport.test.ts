import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sendNotification } from "../src/notification-send.js";
import { demoSignal } from "../src/notification-format.js";

test("LINE sends Flex with stable retry key; Telegram sends minimal text or branded photo without paid broadcasts", async () => {
  const original = globalThis.fetch,
    beforeLine = process.env.LINE_ACCESS_TOKEN,
    beforeTelegram = process.env.TELEGRAM_BOT_TOKEN;
  process.env.LINE_ACCESS_TOKEN = "fixture-token";
  process.env.TELEGRAM_BOT_TOKEN = "fixture-token";
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
  } finally {
    globalThis.fetch = original;
    if (beforeLine === undefined) delete process.env.LINE_ACCESS_TOKEN;
    else process.env.LINE_ACCESS_TOKEN = beforeLine;
    if (beforeTelegram === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = beforeTelegram;
  }
});
