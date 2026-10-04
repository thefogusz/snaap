import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import type pg from "pg";
import { registerDestinations } from "../src/destinations.js";
import { unseal, seal } from "../src/vault.js";
import { sendNotification } from "../src/notification-send.js";
import { demoSignal } from "../src/notification-format.js";
import {
  verifyTelegramDestination,
  discoverTelegramChats,
} from "../src/telegram-destination.js";

test("chat discovery deduplicates chats without acknowledging updates or exposing messages", async () => {
  const original = globalThis.fetch;
  const calls: { url: string; body: any }[] = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init?.body as string) });
    const result = String(url).endsWith("getWebhookInfo")
      ? { url: "" }
      : [
          {
            message: {
              chat: { id: 123, type: "private", first_name: "Gus" },
              text: "private message",
            },
          },
          {
            message: { chat: { id: 123, type: "private", first_name: "Gus" } },
          },
          {
            channel_post: {
              chat: { id: -100123, type: "channel", title: "My channel" },
            },
          },
        ];
    return new Response(JSON.stringify({ ok: true, result }));
  };
  try {
    const chats = await discoverTelegramChats("fixture-token");
    assert.deepEqual(
      chats.map((chat) => chat.id),
      ["123", "-100123"],
    );
    assert.doesNotMatch(JSON.stringify(chats), /private message|fixture-token/);
    assert.deepEqual(calls.at(-1)?.body, { timeout: 0, limit: 100 });
  } finally {
    globalThis.fetch = original;
  }
});

test("chat discovery leaves existing Telegram webhooks in place", async () => {
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return new Response(
      JSON.stringify({
        ok: true,
        result: { url: "https://existing.example/hook" },
      }),
    );
  };
  try {
    await assert.rejects(discoverTelegramChats("fixture-token"), /Chat ID/);
    assert.equal(calls.length, 1);
    assert.ok(calls[0].endsWith("getWebhookInfo"));
  } finally {
    globalThis.fetch = original;
  }
});

test("Telegram connects a user's bot and chat, encrypts credentials, and never returns them", async () => {
  const originalFetch = globalThis.fetch;
  const beforeKey = process.env.DATA_ENCRYPTION_KEY;
  const beforeBot = process.env.TELEGRAM_BOT_TOKEN;
  process.env.DATA_ENCRYPTION_KEY = "a".repeat(64);
  delete process.env.TELEGRAM_BOT_TOKEN;
  const token = "123456:" + "a".repeat(35);
  const calls: string[] = [];
  let inserted: any[] | undefined;
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    const result = String(url).endsWith("getMe")
      ? { is_bot: true, username: "UsersOwn_bot" }
      : String(url).endsWith("getChat")
        ? { id: -1001234567890, type: "channel" }
        : { message_id: 42 };
    return new Response(JSON.stringify({ ok: true, result }), { status: 200 });
  };
  const owner = "00000000-0000-4000-8000-000000000001";
  const app = Fastify();
  app.decorateRequest("userId", owner);
  const db = {
    query: async (sql: string, values: any[]) => {
      if (sql.startsWith("SELECT count")) return { rows: [{ n: 0 }] };
      if (sql.startsWith("INSERT INTO destinations")) inserted = values;
      return { rows: [], rowCount: 0 };
    },
  } as unknown as pg.Pool;
  try {
    await registerDestinations(app, db);
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/destinations",
      payload: {
        kind: "TELEGRAM",
        name: "My channel",
        botToken: token,
        recipient: "@my_channel",
        appearance: { layout: "minimal" },
      },
    });
    assert.equal(response.statusCode, 201, response.body);
    assert.equal(response.json().verified, true);
    assert.equal(response.json().connectUrl, undefined);
    assert.equal(response.json().command, undefined);
    assert.doesNotMatch(response.body, /SnaapDev|123456:/);
    assert.equal(inserted?.[4].recipient, "-1001234567890");
    assert.equal(inserted?.[4].botUsername, "UsersOwn_bot");
    assert.equal(
      unseal(
        inserted?.[4].encryptedTelegram,
        `telegram:${owner}:${inserted?.[0]}`,
      ).token,
      token,
    );
    assert.ok(
      calls.every((url) =>
        url.startsWith(`https://api.telegram.org/bot${token}/`),
      ),
    );
    assert.ok(calls.some((url) => url.endsWith("sendMessage")));
    assert.throws(() =>
      unseal(
        inserted?.[4].encryptedTelegram,
        `telegram:other-user:${inserted?.[0]}`,
      ),
    );
  } finally {
    await app.close();
    globalThis.fetch = originalFetch;
    if (beforeKey === undefined) delete process.env.DATA_ENCRYPTION_KEY;
    else process.env.DATA_ENCRYPTION_KEY = beforeKey;
    if (beforeBot === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = beforeBot;
  }
});

test("Telegram send uses each destination's encrypted bot instead of the server bot", async () => {
  const originalFetch = globalThis.fetch,
    beforeKey = process.env.DATA_ENCRYPTION_KEY,
    beforeBot = process.env.TELEGRAM_BOT_TOKEN;
  process.env.DATA_ENCRYPTION_KEY = "a".repeat(64);
  process.env.TELEGRAM_BOT_TOKEN = "server-fixture";
  const urls: string[] = [];
  globalThis.fetch = async (url, init) => {
    urls.push(String(url));
    assert.equal(JSON.parse(init?.body as string).chat_id, "123456789");
    return new Response(
      JSON.stringify({ ok: true, result: { message_id: 2 } }),
    );
  };
  try {
    for (const token of ["user-one-fixture", "user-two-fixture"]) {
      const result = await sendNotification(
        {
          id: "destination",
          owner_id: "owner",
          kind: "TELEGRAM",
          verified: true,
          appearance: { layout: "minimal" },
          config: {
            recipient: "123456789",
            encryptedTelegram: seal({ token }, "telegram:owner:destination"),
          },
        },
        demoSignal(),
        "request",
      );
      assert.equal(result.status, "SENT");
      assert.equal(
        urls.at(-1),
        `https://api.telegram.org/bot${token}/sendMessage`,
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (beforeKey === undefined) delete process.env.DATA_ENCRYPTION_KEY;
    else process.env.DATA_ENCRYPTION_KEY = beforeKey;
    if (beforeBot === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = beforeBot;
  }
});

test("Telegram provider errors do not expose bot credentials", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("https://api.telegram.org/botprivate-secret/getMe");
  };
  try {
    await assert.rejects(
      verifyTelegramDestination("private-secret", "123456789"),
      (error) => {
        assert.doesNotMatch(String(error), /private-secret/);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
