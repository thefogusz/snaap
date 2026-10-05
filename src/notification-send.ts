import { readFile } from "node:fs/promises";
import { createHmac, randomBytes } from "node:crypto";
import { postWebhook } from "./network.js";
import { discordWebhookUrl } from "./discord.js";
import { unseal } from "./vault.js";
import { telegramChartPng } from "./telegram-chart.js";
import {
  channelAppearance,
  renderSignal,
  signalBanner,
  type Signal,
  publicBrandOrigin,
} from "./notification-format.js";
import { chartPng, chartUrl } from "./signal-chart.js";

export type Destination = {
  id: string;
  owner_id: string;
  kind: string;
  config: any;
  appearance?: unknown;
  verified: boolean;
};
export type SendResult = { status: string; detail: string };
export function providerResult(
  kind: string,
  http: number,
  body: any,
  acceptedId?: string | null,
): SendResult {
  if (kind === "LINE" && http === 409 && acceptedId)
    return { status: "SENT", detail: "ผู้ให้บริการรับคำขอเดิมแล้ว" };
  if (http === 429)
    return {
      status: kind === "LINE" ? "QUOTA_OR_RATE_LIMIT" : "RETRY",
      detail: "ถึงขีดจำกัดการส่ง สัญญาณยังอยู่ในเว็บ",
    };
  if (http < 200 || http >= 300)
    return { status: http >= 500 ? "RETRY" : "FAILED", detail: `HTTP ${http}` };
  if (
    kind === "TELEGRAM" &&
    (body?.ok !== true || !Number.isInteger(body?.result?.message_id))
  )
    return { status: "FAILED", detail: "Telegram ยังไม่ยืนยันข้อความ" };
  if (kind === "DISCORD" && !body?.id)
    return { status: "UNKNOWN", detail: "Discord ยังไม่ยืนยันข้อความ" };
  return {
    status: "SENT",
    detail: "ผู้ให้บริการรับคำขอแล้ว",
  };
}
export async function sendNotification(
  destination: Destination,
  signal: Signal,
  requestId: string,
  origin = process.env.APP_ORIGIN ?? "http://127.0.0.1:4173",
): Promise<SendResult> {
  const appearance = channelAppearance(
    destination.kind,
    destination.appearance,
  );
  try {
    const graph =
      appearance.layout === "card" && appearance.showChart
        ? await chartPng(signal, appearance.accent)
        : undefined;
    const graphUrl = graph
      ? chartUrl(
          signal.test ? `demo-${signal.event.time}` : signal.signal_id,
          appearance.accent,
          publicBrandOrigin(origin),
        )
      : undefined;
    const rendered = renderSignal(
      destination.kind,
      signal,
      appearance,
      origin,
      graphUrl ??
        (graph && destination.kind === "DISCORD"
          ? "attachment://snaap-chart.png"
          : undefined),
    );
    if (destination.kind === "DISCORD") {
      const config = unseal(
        destination.config.encryptedUrl,
        `discord:${destination.owner_id}:${destination.id}`,
      );
      let body: string | Buffer = JSON.stringify(rendered.payload);
      const headers: Record<string, string> = {};
      const files: { filename: string; data: Buffer }[] = [];
      if (graph) files.push({ filename: "snaap-chart.png", data: graph });
      if (
        rendered.payload.embeds?.[0]?.author?.icon_url ===
        "attachment://snaap-card-symbol.png"
      )
        files.push({
          filename: "snaap-card-symbol.png",
          data: await readFile(
            new URL("../dist/assets/snaap-card-symbol.png", import.meta.url),
          ),
        });
      if (files.length) {
        const boundary = "snaap-" + randomBytes(16).toString("hex");
        rendered.payload.attachments = files.map((file, id) => ({
          id,
          filename: file.filename,
        }));
        if (graph && rendered.payload.embeds?.[0])
          rendered.payload.embeds[0].image = {
            url: "attachment://snaap-chart.png",
          };
        body = Buffer.concat([
          Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="payload_json"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(rendered.payload)}\r\n`,
          ),
          ...files.flatMap((file, id) => [
            Buffer.from(
              `--${boundary}\r\nContent-Disposition: form-data; name="files[${id}]"; filename="${file.filename}"\r\nContent-Type: image/png\r\n\r\n`,
            ),
            file.data,
            Buffer.from("\r\n"),
          ]),
          Buffer.from(`--${boundary}--\r\n`),
        ]);
        headers["Content-Type"] = "multipart/form-data; boundary=" + boundary;
      }
      const response = await postWebhook(
        discordWebhookUrl(config.url),
        body,
        headers,
        ["discord.com"],
      );
      let responseData;
      try {
        responseData = JSON.parse(response.body);
      } catch {}
      return providerResult("DISCORD", response.status, responseData);
    }
    if (destination.kind === "WEBHOOK") {
      const config = destination.config.encryptedWebhook
        ? unseal(
            destination.config.encryptedWebhook,
            `webhook:${destination.owner_id}:${destination.id}`,
          )
        : destination.config;
      const secret = config.signingSecret ?? process.env.WEBHOOK_SIGNING_SECRET;
      if (!secret)
        return { status: "FAILED", detail: "ยังไม่ได้ตั้งค่าลายเซ็น Webhook" };
      const body = JSON.stringify(rendered.payload);
      const timestamp = String(Math.floor(Date.now() / 1000));
      const response = await postWebhook(config.url, body, {
        "x-snaap-id": signal.signal_id,
        "x-snaap-timestamp": timestamp,
        "x-snaap-signature": createHmac("sha256", secret)
          .update(body)
          .digest("hex"),
        "x-snaap-signature-v1": createHmac("sha256", secret)
          .update(timestamp + "." + body)
          .digest("hex"),
      });
      return providerResult("WEBHOOK", response.status, null);
    }
    const line = destination.kind === "LINE";
    const telegramToken =
      !line && destination.config.encryptedTelegram
        ? unseal(
            destination.config.encryptedTelegram,
            `telegram:${destination.owner_id}:${destination.id}`,
          ).token
        : process.env.TELEGRAM_BOT_TOKEN;
    if (line ? !process.env.LINE_ACCESS_TOKEN : !telegramToken)
      return {
        status: "FAILED",
        detail: "ช่องทางนี้ยังไม่ได้ตั้งค่าบนเซิร์ฟเวอร์",
      };
    let url = line
      ? "https://api.line.me/v2/bot/message/push"
      : `https://api.telegram.org/bot${telegramToken}/sendMessage`;
    let body: BodyInit;
    const headers: Record<string, string> = {};
    if (line) {
      headers.Authorization = `Bearer ${process.env.LINE_ACCESS_TOKEN}`;
      headers["X-Line-Retry-Key"] = requestId;
      headers["Content-Type"] = "application/json";
      body = JSON.stringify({
        to: destination.config.recipient,
        messages: [rendered.payload],
      });
    } else if (rendered.layout === "card" || graph) {
      url = `https://api.telegram.org/bot${telegramToken}/sendPhoto`;
      const form = new FormData();
      form.set("chat_id", destination.config.recipient);
      form.set("caption", rendered.text.slice(0, 1024));
      if (rendered.payload.reply_markup)
        form.set("reply_markup", JSON.stringify(rendered.payload.reply_markup));
      form.set(
        "photo",
        new Blob(
          [
            new Uint8Array(
              (graph
                ? await telegramChartPng(graph, appearance.accent)
                : undefined) ??
                (await readFile(
                  new URL(
                    "../dist/assets/" + signalBanner(appearance.accent),
                    import.meta.url,
                  ),
                )),
            ),
          ],
          { type: "image/png" },
        ),
        "snaap.png",
      );
      body = form;
    } else {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify({
        chat_id: destination.config.recipient,
        ...rendered.payload,
      });
    }
    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(10000),
    });
    let result;
    try {
      result = await response.json();
    } catch {}
    return providerResult(
      destination.kind,
      response.status,
      result,
      response.headers.get("x-line-accepted-request-id"),
    );
  } catch {
    return {
      status: ["TELEGRAM", "DISCORD"].includes(destination.kind)
        ? "UNKNOWN"
        : "RETRY",
      detail: "ยืนยันผลการส่งไม่ได้",
    };
  }
}
