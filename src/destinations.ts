import { signalDirection } from "../dist/trade-direction.js";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
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
import { discordWebhookUrl, postDiscord } from "./discord.js";
import { seal, unseal } from "./vault.js";
export const equalSecret = (a: string, b: string) =>
  Buffer.byteLength(a) === Buffer.byteLength(b) &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
export async function registerDestinations(app: FastifyInstance, db: pg.Pool) {
  app.get("/api/v1/destinations", async (req) => ({
    items: (
      await db.query(
        "SELECT id,kind,name,verified FROM destinations WHERE owner_id=$1 ORDER BY created_at",
        [req.userId],
      )
    ).rows,
    available: {
      TELEGRAM: !!(
        process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_WEBHOOK_SECRET
      ),
      LINE: !!(
        process.env.LINE_CHANNEL_SECRET && process.env.LINE_ACCESS_TOKEN
      ),
      WEBHOOK: !!process.env.WEBHOOK_ALLOWED_HOSTS,
      DISCORD: /^[a-f0-9]{64}$/i.test(process.env.DATA_ENCRYPTION_KEY ?? ""),
    },
  }));
  app.post("/api/v1/destinations", async (req, reply) => {
    const input = z
      .object({
        kind: z.enum(["TELEGRAM", "LINE", "WEBHOOK", "DISCORD"]),
        name: z.string().trim().min(1).max(80),
        url: z.string().url().max(2000).optional(),
      })
      .strict()
      .parse(req.body);
    const ready =
      input.kind === "TELEGRAM"
        ? process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_WEBHOOK_SECRET
        : input.kind === "LINE"
          ? process.env.LINE_CHANNEL_SECRET && process.env.LINE_ACCESS_TOKEN
          : input.kind === "DISCORD"
            ? /^[a-f0-9]{64}$/i.test(process.env.DATA_ENCRYPTION_KEY ?? "")
            : process.env.WEBHOOK_ALLOWED_HOSTS;
    if (!ready)
      throw new ApiError(
        503,
        "CHANNEL_NOT_CONFIGURED",
        "ช่องทางนี้ยังไม่ได้ตั้งค่าบนเซิร์ฟเวอร์",
      );
    const id = randomUUID(),
      code = randomBytes(24).toString("hex");
    let verified = false;
    let encryptedUrl: string | undefined;
    if (input.kind === "DISCORD") {
      if (!input.url)
        throw new ApiError(400, "URL_REQUIRED", "วาง Discord Webhook URL");
      try {
        discordWebhookUrl(input.url);
      } catch {
        throw new ApiError(
          400,
          "INVALID_DISCORD_WEBHOOK",
          "ใช้ Webhook URL จาก discord.com ในการตั้งค่าห้อง Discord",
        );
      }
      encryptedUrl = seal({ url: input.url }, `discord:${req.userId}:${id}`);
      try {
        const check = await postDiscord(
          input.url,
          "เชื่อมต่อ Snaap สำเร็จ · เลือกช่องทางนี้ในเซตอัปเพื่อรับสัญญาณ",
        );
        verified =
          check.status >= 200 &&
          check.status < 300 &&
          !!JSON.parse(check.body).id;
      } catch {
        throw new ApiError(
          400,
          "DISCORD_CONNECT_FAILED",
          "เชื่อม Discord ไม่สำเร็จ ตรวจ Webhook URL แล้วลองใหม่",
        );
      }
      if (!verified)
        throw new ApiError(
          400,
          "DISCORD_CONNECT_FAILED",
          "Discord ยังไม่ยืนยันข้อความทดสอบ ตรวจ Webhook URL แล้วลองใหม่",
        );
    }
    if (input.kind === "WEBHOOK") {
      if (!input.url) throw new ApiError(400, "URL_REQUIRED", "ระบุ HTTPS URL");
      const check = await postWebhook(
        input.url,
        JSON.stringify({ type: "snaap.verify", challenge: code }),
      );
      verified = check.status === 200 && check.body.trim() === code;
      if (!verified)
        throw new ApiError(
          400,
          "VERIFICATION_FAILED",
          "ปลายทางต้องตอบ challenge กลับเป็นข้อความ",
        );
    }
    const config =
      input.kind === "DISCORD"
        ? { encryptedUrl }
        : input.kind === "WEBHOOK"
          ? { url: input.url }
          : { challengeHash: hash(code), expiresAt: Date.now() + 600000 };
    await db.query(
      "INSERT INTO destinations(id,owner_id,kind,name,config,verified) VALUES($1,$2,$3,$4,$5,$6)",
      [id, req.userId, input.kind, input.name, config, verified],
    );
    return reply.code(201).send({
      id,
      verified,
      instruction: verified
        ? "ยืนยันปลายทางแล้ว"
        : `ส่งข้อความ /start ${code} ไปยัง ${input.kind === "TELEGRAM" ? "@" + (process.env.TELEGRAM_BOT_USERNAME ?? "บอตที่ตั้งค่าไว้") : "LINE OA ของ SNAAP"} ภายใน 10 นาที`,
    });
  });
  app.delete("/api/v1/destinations/:id", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await db.query(
      "UPDATE destinations SET verified=false WHERE id=$1 AND owner_id=$2",
      [id, req.userId],
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
  async function bind(kind: string, text: string, recipient: string) {
    const match = /^\/start ([a-f0-9]{48})$/.exec(text);
    if (!match) return;
    await db.query(
      "UPDATE destinations SET verified=true,config=jsonb_build_object('recipient',$1::text) WHERE kind=$2 AND NOT verified AND config->>'challengeHash'=$3 AND (config->>'expiresAt')::bigint>$4",
      [recipient, kind, hash(match[1]), Date.now()],
    );
  }
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
      await bind("TELEGRAM", input.message.text, String(input.message.chat.id));
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
          await bind("LINE", event.message.text, event.source.userId);
      return { ok: true };
    });
  });
}
/** Transaction lock avoids two workers delivering concurrently. Provider timeout remains ambiguous. */
export async function deliver(db: pg.Pool, id: string) {
  return transaction(db, async (c) => {
    const row = (
      await c.query(
        "SELECT d.*,t.kind,t.config,t.verified,t.owner_id,s.event,s.pair,s.exchange,s.revision,rv.spec->>'market' AS setup_market,rv.spec->>'side' AS setup_side FROM deliveries d JOIN destinations t ON t.id=d.destination_id JOIN signals s ON s.id=d.signal_id LEFT JOIN rule_revisions rv ON rv.rule_id=s.rule_id AND rv.revision=s.revision WHERE d.id=$1 FOR UPDATE OF d",
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
    const text = `SNAAP · ${row.exchange} ${row.pair}\n${({ ENTRY: "สัญญาณเข้า", EXIT: "สัญญาณออก", CANCEL: "ยกเลิก", EXPIRED: "หมดเวลารอ" } as Record<string, string>)[row.event.kind] ?? row.event.kind} · ${signalDirection(row.event, row.setup_market, row.setup_side)} · ${row.event.referencePrice}\nเซตอัป v${row.revision} · ${new Date(row.event.time).toISOString()}\nสัญญาณ ไม่ใช่ออเดอร์จริง\nID ${row.signal_id}`;
    let status = "SENT",
      detail = "";
    try {
      let result: Response | { status: number };
      if (row.kind === "DISCORD") {
        const config = unseal(
          row.config.encryptedUrl,
          `discord:${row.owner_id}:${row.destination_id}`,
        );
        result = await postDiscord(config.url, text);
      } else if (row.kind === "WEBHOOK") {
        if (!process.env.WEBHOOK_SIGNING_SECRET)
          throw new Error("SIGNING_NOT_CONFIGURED");
        const body = JSON.stringify({
          id: row.signal_id,
          event: row.event,
          pair: row.pair,
          exchange: row.exchange,
          revision: row.revision,
        });
        result = await postWebhook(row.config.url, body, {
          "x-snaap-id": row.signal_id,
          "x-snaap-signature": createHmac(
            "sha256",
            process.env.WEBHOOK_SIGNING_SECRET,
          )
            .update(body)
            .digest("hex"),
        });
      } else {
        const line = row.kind === "LINE",
          url = line
            ? "https://api.line.me/v2/bot/message/push"
            : `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (line) {
          headers.Authorization = `Bearer ${process.env.LINE_ACCESS_TOKEN}`;
          headers["X-Line-Retry-Key"] = row.id;
        }
        result = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(
            line
              ? { to: row.config.recipient, messages: [{ type: "text", text }] }
              : { chat_id: row.config.recipient, text },
          ),
          signal: AbortSignal.timeout(10000),
        });
      }
      if (result.status === 429) {
        status = row.kind === "LINE" ? "QUOTA_OR_RATE_LIMIT" : "RETRY";
        detail = "โควตาหรืออัตราการส่งถึงขีดจำกัด สัญญาณยังอยู่ในเว็บ";
      } else if (result.status < 200 || result.status >= 300) {
        status = result.status >= 500 ? "RETRY" : "FAILED";
        detail = `HTTP ${result.status}`;
      }
    } catch {
      status = ["TELEGRAM", "DISCORD"].includes(row.kind) ? "UNKNOWN" : "RETRY";
      detail = "ยืนยันผลการส่งไม่ได้";
    }
    if (status === "RETRY" && row.attempts >= 4) status = "FAILED";
    await c.query(
      "UPDATE deliveries SET status=$2,attempts=attempts+1,detail=$3 WHERE id=$1",
      [id, status, detail],
    );
  });
}
