import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import type pg from "pg";
import { registerDestinations } from "../src/destinations.js";
import { appearanceSchema } from "../src/notification-format.js";
import { createHmac } from "node:crypto";
import { ZodError } from "zod";

test("channel owner can preview and save appearance; outsiders cannot edit or send tests", async () => {
  const owner = "00000000-0000-4000-8000-000000000001",
    id = "00000000-0000-4000-8000-000000000002";
  let appearance = appearanceSchema.parse({});
  const app = Fastify();
  app.setErrorHandler((error, _req, reply) =>
    reply
      .code(
        error instanceof ZodError
          ? 400
          : ((error as { statusCode?: number }).statusCode ?? 500),
      )
      .send({ error: "fixture" }),
  );
  app.decorateRequest("userId", "");
  app.addHook("preHandler", async (req) => {
    req.userId = String(req.headers["test-owner"] ?? owner);
  });
  const db = {
    query: async (sql: string, values: any[]) => {
      if (sql.startsWith("SELECT * FROM destinations"))
        return {
          rows:
            values[1] === owner
              ? [
                  {
                    id,
                    owner_id: owner,
                    kind: "TELEGRAM",
                    config: { recipient: "test" },
                    verified: false,
                    appearance,
                  },
                ]
              : [],
          rowCount: values[1] === owner ? 1 : 0,
        };
      if (sql.startsWith("UPDATE destinations SET name")) {
        appearance = values[3];
        return { rowCount: 1, rows: [] };
      }
      return { rows: [], rowCount: 0 };
    },
  } as unknown as pg.Pool;
  await registerDestinations(app, db);
  try {
    const preview = await app.inject({
      method: "POST",
      url: "/api/v1/destinations/preview",
      payload: { kind: "LINE", appearance: {} },
    });
    assert.equal(preview.statusCode, 200);
    assert.equal(preview.json().payload.type, "flex");
    const payload = {
      name: "Personal",
      appearance: { layout: "minimal", showPrice: false },
    };
    assert.equal(
      (
        await app.inject({
          method: "PATCH",
          url: "/api/v1/destinations/" + id,
          payload,
          headers: { "test-owner": "other" },
        })
      ).statusCode,
      404,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/destinations/" + id + "/test",
          payload: {},
          headers: { "test-owner": "other" },
        })
      ).statusCode,
      404,
    );
    assert.equal(
      (
        await app.inject({
          method: "PATCH",
          url: "/api/v1/destinations/" + id,
          payload,
        })
      ).statusCode,
      200,
    );
    assert.equal(appearance.layout, "minimal");
    assert.equal(appearance.showPrice, false);
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/destinations/" + id + "/test",
          payload: {},
        })
      ).statusCode,
      409,
    );
    assert.equal(
      (
        await app.inject({
          method: "PATCH",
          url: "/api/v1/destinations/" + id,
          payload: { ...payload, appearance: { url: "https://evil.invalid" } },
        })
      ).statusCode,
      400,
    );
  } finally {
    await app.close();
  }
});
test("LINE hooks require signatures over raw body and only bind user chats", async () => {
  const before = process.env.LINE_CHANNEL_SECRET;
  process.env.LINE_CHANNEL_SECRET = "test-line-secret";
  const updates: any[] = [];
  const db = {
    query: async (sql: string, values: any[]) => {
      updates.push({ sql, values });
      return { rows: [], rowCount: 0 };
    },
  } as unknown as pg.Pool;
  const app = Fastify();
  await registerDestinations(app, db);
  try {
    const payload = JSON.stringify({
      events: [
        {
          type: "message",
          source: { type: "user", userId: "U-test" },
          message: { type: "text", text: "/start " + "a".repeat(48) },
        },
      ],
    });
    const signature = createHmac("sha256", process.env.LINE_CHANNEL_SECRET)
      .update(payload)
      .digest("base64");
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/hooks/line",
          payload,
          headers: {
            "content-type": "application/json",
            "x-line-signature": "wrong",
          },
        })
      ).statusCode,
      403,
    );
    assert.equal(updates.length, 0);
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/hooks/line",
          payload,
          headers: {
            "content-type": "application/json",
            "x-line-signature": signature,
          },
        })
      ).statusCode,
      200,
    );
    assert.equal(updates[0].values[0], "U-test");
  } finally {
    await app.close();
    if (before === undefined) delete process.env.LINE_CHANNEL_SECRET;
    else process.env.LINE_CHANNEL_SECRET = before;
  }
});
