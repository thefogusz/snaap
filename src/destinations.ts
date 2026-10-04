import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { telegramChartPng } from "./telegram-chart.js";
import {
  randomUUID,
  randomBytes,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";
import { ApiError } from "./errors.js";
import { hash } from "./crypto.js";
import { transaction } from "./data/db.js";
import { postWebhook } from "./network.js";
import { discordWebhookUrl } from "./discord.js";
import { seal } from "./vault.js";
import {
  telegramToken,
  telegramRecipient,
  verifyTelegramDestination,
  discoverTelegramChats,
} from "./telegram-destination.js";
import {
  appearanceSchema,
  channelAppearance,
  channelKind,
  demoSignal,
  renderSignal,
  type Signal,
} from "./notification-format.js";
import { sendNotification, type Destination } from "./notification-send.js";
import { lineLimits, lineMonth, reserveLine } from "./line-quota.js";
import { chartPng, registerSignalCharts, demoChart } from "./signal-chart.js";
import {
  bindRecipient,
  registerTelegramPolling,
  telegramMode,
} from "./telegram-polling.js";

export const equalSecret = (a: string, b: string) =>
  Buffer.byteLength(a) === Buffer.byteLength(b) &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
export function channelAvailability(local = false) {
  const encrypted = /^[a-f0-9]{64}$/i.test(
    process.env.DATA_ENCRYPTION_KEY ?? "",
  );
  return {
    TELEGRAM: encrypted,
    LINE: !!(process.env.LINE_CHANNEL_SECRET && process.env.LINE_ACCESS_TOKEN),
    DISCORD: encrypted,
    WEBHOOK: encrypted && !!process.env.WEBHOOK_ALLOWED_HOSTS?.trim(),
  };
}
export async function registerDestinations(
  app: FastifyInstance,
  db: pg.Pool,
  options: { local?: boolean; origin?: string } = {},
) {
  const origin =
    options.origin ?? process.env.APP_ORIGIN ?? "http://127.0.0.1:4173";
  registerTelegramPolling(app, db, options.local);
  registerSignalCharts(app, db);
  const owned = async (id: string, owner: string): Promise<Destination> => {
    const row = (
      await db.query("SELECT * FROM destinations WHERE id=$1 AND owner_id=$2", [
        id,
        owner,
      ])
    ).rows[0];
    if (!row)
      throw new ApiError(404, "DESTINATION_NOT_FOUND", "ไม่พบช่องทางนี้");
    return row;
  };
  const parseId = (params: unknown) =>
    z.object({ id: z.string().uuid() }).parse(params).id;
  app.get("/api/v1/destinations", async (req) => {
    const items = (
      await db.query(
        "SELECT id,kind,name,verified,appearance FROM destinations WHERE owner_id=$1 AND (verified OR config ? 'challengeHash') ORDER BY created_at",
        [req.userId],
      )
    ).rows.map((row) => ({
      ...row,
      appearance: channelAppearance(row.kind, row.appearance),
    }));
    const usage =
      (
        await db.query(
          "SELECT count(*)::integer AS used FROM notification_quota WHERE owner_id=$1 AND month=$2",
          [req.userId, lineMonth()],
        )
      ).rows[0]?.used ?? 0;
    return {
      items,
      available: channelAvailability(options.local),
      connection: {
        telegramUsername: process.env.TELEGRAM_BOT_USERNAME ?? "",
        lineUrl:
          process.env.LINE_OA_URL?.startsWith("https://line.me/") ||
          process.env.LINE_OA_URL?.startsWith("https://lin.ee/")
            ? process.env.LINE_OA_URL
            : undefined,
      },
      lineQuota: { used: usage, limit: lineLimits().user, month: lineMonth() },
    };
  });
  app.post("/api/v1/destinations/preview", async (req) => {
    const input = z
      .object({ kind: channelKind, appearance: appearanceSchema })
      .strict()
      .parse(req.body);
    const demo = demoSignal();
    const chart =
      input.appearance.layout === "card" && input.appearance.showChart
        ? await chartPng(demo, input.appearance.accent)
        : undefined;
    const previewChart =
      chart && input.kind === "TELEGRAM"
        ? await telegramChartPng(chart, input.appearance.accent)
        : chart;
    return {
      ...renderSignal(input.kind, demo, input.appearance, origin),
      chartPreview: previewChart
        ? "data:image/png;base64," + previewChart.toString("base64")
        : undefined,
    };
  });
  app.post("/api/v1/destinations/telegram/chats", async (req) => {
    const input = z
      .object({ botToken: telegramToken })
      .strict()
      .parse(req.body);
    return { chats: await discoverTelegramChats(input.botToken) };
  });
  app.patch("/api/v1/destinations/:id", async (req) => {
    const id = parseId(req.params);
    const input = z
      .object({
        name: z.string().trim().min(1).max(80),
        appearance: appearanceSchema,
      })
      .strict()
      .parse(req.body);
    await owned(id, req.userId);
    await db.query(
      "UPDATE destinations SET name=$3,appearance=$4 WHERE id=$1 AND owner_id=$2",
      [id, req.userId, input.name, input.appearance],
    );
    return { ok: true };
  });
  app.post(
    "/api/v1/destinations/:id/test",
    { config: { rateLimit: { max: 3, timeWindow: "1 minute" } } },
    async (req) => {
      const row = await owned(parseId(req.params), req.userId);
      if (!row.verified)
        throw new ApiError(409, "NOT_VERIFIED", "ยืนยันช่องทางก่อนส่งทดสอบ");
      const id = randomUUID();
      if (
        row.kind === "LINE" &&
        !(await transaction(db, (c) => reserveLine(c, req.userId, id)))
      )
        throw new ApiError(
          429,
          "LINE_QUOTA",
          "ถึงโควตา LINE เดือนนี้แล้ว สัญญาณยังอยู่ในเว็บ",
        );
      const testTime = Date.now();
      const signal = {
        ...demoSignal(),
        signal_id: id,
        event: { ...demoSignal().event, time: testTime },
        chart: demoChart(testTime),
      };
      const result = await sendNotification(row, signal, id, origin);
      return { id, ...result };
    },
  );
  app.post(
    "/api/v1/destinations",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const input = z
        .object({
          kind: channelKind,
          name: z.string().trim().min(1).max(80),
          url: z.string().url().max(2000).optional(),
          botToken: telegramToken.optional(),
          recipient: telegramRecipient.optional(),
          appearance: appearanceSchema.optional(),
        })
        .strict()
        .parse(req.body);
      if (!channelAvailability(options.local)[input.kind])
        throw new ApiError(
          503,
          "CHANNEL_NOT_CONFIGURED",
          "ผู้ดูแลยังไม่ได้ตั้งค่าช่องทางนี้",
        );
      const count = await db.query(
        "SELECT count(*)::integer AS n FROM destinations WHERE owner_id=$1 AND (verified OR config ? 'challengeHash')",
        [req.userId],
      );
      if ((count.rows[0]?.n ?? 0) >= 50)
        throw new ApiError(
          409,
          "DESTINATION_LIMIT",
          "เพิ่มช่องทางได้สูงสุด 50 ช่องทาง",
        );
      const id = randomUUID(),
        code = randomBytes(24).toString("hex");
      const appearance =
        input.appearance ??
        appearanceSchema.parse({
          layout: input.kind === "TELEGRAM" ? "minimal" : "card",
        });
      let config: any = {
        challengeHash: hash(code),
        expiresAt: Date.now() + 600000,
      };
      let verified = false,
        signingSecret: string | undefined;
      if (input.kind !== "TELEGRAM" && (input.botToken || input.recipient))
        throw new ApiError(
          400,
          "INVALID_CHANNEL_FIELDS",
          "ข้อมูลบอตใช้สำหรับ Telegram เท่านั้น",
        );
      if (input.kind === "TELEGRAM") {
        if (!input.botToken || !input.recipient)
          throw new ApiError(
            400,
            "TELEGRAM_FIELDS_REQUIRED",
            "ระบุ Bot Token และ Chat ID ของคุณ",
          );
        const bot = await verifyTelegramDestination(
          input.botToken,
          input.recipient,
        );
        config = {
          recipient: bot.recipient,
          botUsername: bot.username,
          encryptedTelegram: seal(
            { token: input.botToken },
            `telegram:${req.userId}:${id}`,
          ),
        };
        const result = await sendNotification(
          {
            id,
            owner_id: req.userId,
            kind: input.kind,
            config,
            appearance,
            verified: true,
          },
          demoSignal(),
          randomUUID(),
          origin,
        );
        if (result.status !== "SENT")
          throw new ApiError(
            400,
            "TELEGRAM_SEND_FAILED",
            "บอตยังส่งถึงปลายทางไม่ได้ ตรวจ Chat ID และสิทธิ์ของบอตแล้วลองใหม่",
          );
        verified = true;
      } else if (input.kind === "DISCORD") {
        if (!input.url)
          throw new ApiError(400, "URL_REQUIRED", "วาง Discord Webhook URL");
        try {
          discordWebhookUrl(input.url);
        } catch {
          throw new ApiError(
            400,
            "INVALID_DISCORD_WEBHOOK",
            "ใช้ Webhook URL จากการตั้งค่าห้อง Discord",
          );
        }
        config = {
          encryptedUrl: seal({ url: input.url }, `discord:${req.userId}:${id}`),
        };
        const result = await sendNotification(
          {
            id,
            owner_id: req.userId,
            kind: input.kind,
            config,
            appearance,
            verified: true,
          },
          demoSignal(),
          randomUUID(),
          origin,
        );
        if (result.status !== "SENT")
          throw new ApiError(
            400,
            "DISCORD_CONNECT_FAILED",
            "Discord ยังไม่ยืนยันข้อความทดสอบ ตรวจ URL และสิทธิ์ของห้องแล้วลองใหม่",
          );
        verified = true;
      } else if (input.kind === "WEBHOOK") {
        if (!input.url)
          throw new ApiError(400, "URL_REQUIRED", "ระบุ HTTPS URL");
        let check;
        try {
          check = await postWebhook(
            input.url,
            JSON.stringify({ type: "snaap.verify", challenge: code }),
          );
        } catch {
          throw new ApiError(
            400,
            "WEBHOOK_CONNECT_FAILED",
            "ตรวจ HTTPS URL และให้ผู้ดูแลอนุญาตโดเมนปลายทางก่อนเชื่อม",
          );
        }
        if (check.status !== 200 || check.body.trim() !== code)
          throw new ApiError(
            400,
            "VERIFICATION_FAILED",
            "ปลายทางต้องตอบ challenge กลับเป็นข้อความ HTTP 200",
          );
        signingSecret = randomBytes(32).toString("hex");
        config = {
          encryptedWebhook: seal(
            { url: input.url, signingSecret },
            `webhook:${req.userId}:${id}`,
          ),
        };
        verified = true;
      }
      await db.query(
        "INSERT INTO destinations(id,owner_id,kind,name,config,verified,appearance) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [id, req.userId, input.kind, input.name, config, verified, appearance],
      );
      const command = "/start " + code;
      return reply.code(201).send({
        id,
        verified,
        signingSecret,
        command: verified ? undefined : command,
        expiresAt: verified ? undefined : Date.now() + 600000,
        connectUrl: input.kind === "LINE" ? process.env.LINE_OA_URL : undefined,
        instruction: verified
          ? "ยืนยันปลายทางแล้ว"
          : `ส่ง ${command} ไปยัง ${input.kind === "TELEGRAM" ? "@" + process.env.TELEGRAM_BOT_USERNAME : "LINE OA ของ Snaap"} ภายใน 10 นาที`,
      });
    },
  );
  app.delete("/api/v1/destinations/:id", async (req) => {
    await db.query(
      "UPDATE destinations SET verified=false,config=config-'challengeHash'-'expiresAt' WHERE id=$1 AND owner_id=$2",
      [parseId(req.params), req.userId],
    );
    return { ok: true };
  });
  app.get(
    "/api/v1/deliveries",
    async (req) =>
      (
        await db.query(
          "SELECT d.id,d.status,d.attempts,d.detail,d.signal_id,t.name FROM deliveries d JOIN destinations t ON t.id=d.destination_id JOIN signals s ON s.id=d.signal_id JOIN rules r ON r.id=s.rule_id WHERE t.owner_id=$1 AND ($2::uuid IS NULL OR r.workspace_id=$2) ORDER BY d.id DESC LIMIT 100",
          [req.userId, req.workspaceId ?? null],
        )
      ).rows,
  );
  app.post("/api/v1/hooks/telegram", async (req) => {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (
      !secret ||
      !equalSecret(
        String(req.headers["x-telegram-bot-api-secret-token"] ?? ""),
        secret,
      )
    )
      throw new ApiError(403, "SIGNATURE", "ไม่อนุญาต");
    const input = req.body as any;
    if (
      input?.message?.chat?.type === "private" &&
      typeof input.message.text === "string"
    )
      await bindRecipient(
        db,
        "TELEGRAM",
        input.message.text,
        String(input.message.chat.id),
      );
    return { ok: true };
  });
  await app.register(async (hooks) => {
    hooks.removeContentTypeParser("application/json");
    hooks.addContentTypeParser(
      "application/json",
      { parseAs: "buffer" },
      (_req, body, done) => done(null, body),
    );
    hooks.post("/api/v1/hooks/line", async (req) => {
      const secret = process.env.LINE_CHANNEL_SECRET;
      if (!secret)
        throw new ApiError(503, "NOT_CONFIGURED", "ยังไม่เชื่อม LINE");
      const expected = createHmac("sha256", secret)
        .update(req.body as Buffer)
        .digest("base64");
      if (!equalSecret(String(req.headers["x-line-signature"] ?? ""), expected))
        throw new ApiError(403, "SIGNATURE", "ลายเซ็นไม่ถูกต้อง");
      const input = JSON.parse((req.body as Buffer).toString("utf8"));
      for (const event of input.events ?? [])
        if (
          event.type === "message" &&
          event.source?.type === "user" &&
          event.message?.type === "text"
        )
          await bindRecipient(
            db,
            "LINE",
            event.message.text,
            event.source.userId,
          );
      return { ok: true };
    });
  });
}
export async function deliver(db: pg.Pool, id: string) {
  return transaction(db, async (c) => {
    const row = (
      await c.query(
        "SELECT d.*,t.kind,t.config,t.appearance,t.verified,t.owner_id,s.event,s.pair,s.exchange,s.revision,s.chart_snapshot AS chart,rv.spec->>'market' AS setup_market,rv.spec->>'side' AS setup_side,rv.spec->>'name' AS setup_name,rv.spec->>'timeframe' AS timeframe FROM deliveries d JOIN destinations t ON t.id=d.destination_id JOIN signals s ON s.id=d.signal_id LEFT JOIN rule_revisions rv ON rv.rule_id=s.rule_id AND rv.revision=s.revision WHERE d.id=$1 FOR UPDATE OF d",
        [id],
      )
    ).rows[0];
    if (!row || !["PENDING", "RETRY"].includes(row.status)) return;
    if (!row.verified) {
      await c.query("UPDATE deliveries SET status='DISCONNECTED' WHERE id=$1", [
        id,
      ]);
      return;
    }
    let result;
    if (
      row.kind === "LINE" &&
      !(await transaction(db, (q) => reserveLine(q, row.owner_id, id)))
    )
      result = {
        status: "QUOTA_OR_RATE_LIMIT",
        detail: "ถึงโควตา LINE เดือนนี้ สัญญาณยังอยู่ในเว็บ",
      };
    else
      result = await sendNotification(
        {
          id: row.destination_id,
          owner_id: row.owner_id,
          kind: row.kind,
          config: row.config,
          appearance: row.appearance,
          verified: row.verified,
        },
        row as Signal,
        id,
      );
    if (result.status === "RETRY" && row.attempts >= 4)
      result.status = "FAILED";
    await c.query(
      "UPDATE deliveries SET status=$2,attempts=attempts+1,detail=$3 WHERE id=$1",
      [id, result.status, result.detail],
    );
  });
}
