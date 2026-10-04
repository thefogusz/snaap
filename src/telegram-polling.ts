import type pg from "pg";
import { hash } from "./crypto.js";
import { setTimeout as pause } from "node:timers/promises";
import type { FastifyInstance } from "fastify";

export async function bindRecipient(
  db: pg.Pool,
  kind: string,
  text: string,
  recipient: string,
) {
  const match = /^\/start(?:@[A-Za-z0-9_]+)?\s+([a-f0-9]{48})$/.exec(
    text.trim(),
  );
  if (!match || !recipient || recipient.length > 100) return;
  await db.query(
    "UPDATE destinations SET verified=true,config=jsonb_build_object('recipient',$1::text) WHERE kind=$2 AND NOT verified AND config->>'challengeHash'=$3 AND (config->>'expiresAt')::bigint>$4",
    [recipient, kind, hash(match[1]), Date.now()],
  );
}
export function telegramMode(local = false) {
  return process.env.TELEGRAM_RECEIVE_MODE || (local ? "polling" : "webhook");
}
export function registerTelegramPolling(
  app: FastifyInstance,
  db: pg.Pool,
  local = false,
) {
  if (!process.env.TELEGRAM_BOT_TOKEN || telegramMode(local) !== "polling")
    return;
  const controller = new AbortController();
  let running: Promise<void> | undefined;
  app.addHook("onReady", async () => {
    running = poll();
  });
  app.addHook("onClose", async () => {
    controller.abort();
    await running;
  });
  async function poll() {
    const token = process.env.TELEGRAM_BOT_TOKEN!;
    const key = "telegram:" + hash(token);
    let offset = 0;
    try {
      const cursor = await db.query(
        "SELECT offset_id FROM channel_cursors WHERE key=$1",
        [key],
      );
      offset = Number(cursor.rows[0]?.offset_id ?? 0);
      const check = await fetch(
        `https://api.telegram.org/bot${token}/getWebhookInfo`,
        {
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(10000),
          ]),
        },
      );
      const info: any = await check.json();
      if (!info.ok || info.result?.url) {
        console.warn(
          "Telegram polling inactive: check bot credentials or existing webhook; use a separate dev bot.",
        );
        return;
      }
    } catch {
      if (controller.signal.aborted) return;
    }
    while (!controller.signal.aborted) {
      try {
        const response = await fetch(
          `https://api.telegram.org/bot${token}/getUpdates`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              offset,
              timeout: 20,
              allowed_updates: ["message"],
            }),
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(25000),
            ]),
          },
        );
        const data: any = await response.json();
        if (!data.ok || !Array.isArray(data.result))
          throw new Error("POLL_FAILED");
        for (const update of data.result) {
          if (!Number.isSafeInteger(update.update_id)) continue;
          const message = update.message;
          if (
            message?.chat?.type === "private" &&
            typeof message.text === "string"
          )
            await bindRecipient(
              db,
              "TELEGRAM",
              message.text,
              String(message.chat.id),
            );
          offset = update.update_id + 1;
          await db.query(
            "INSERT INTO channel_cursors(key,offset_id) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET offset_id=EXCLUDED.offset_id",
            [key, offset],
          );
        }
      } catch {
        if (!controller.signal.aborted)
          await pause(5000, undefined, { signal: controller.signal }).catch(
            () => {},
          );
      }
    }
  }
}
