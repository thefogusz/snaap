import { z } from "zod";
import { isIP } from "node:net";
import { signalDirection } from "../dist/trade-direction.js";

export const channelKind = z.enum(["TELEGRAM", "LINE", "DISCORD", "WEBHOOK"]);
export const appearanceSchema = z
  .object({
    layout: z.enum(["card", "minimal"]).default("card"),
    accent: z.enum(["lime", "cyan", "violet"]).default("lime"),
    language: z.enum(["th", "en"]).default("th"),
    heading: z.string().trim().max(60).default(""),
    showPrice: z.boolean().default(true),
    showSetup: z.boolean().default(true),
    showTime: z.boolean().default(true),
    showId: z.boolean().default(false),
  })
  .strict();
export type Appearance = z.infer<typeof appearanceSchema>;
export type Signal = {
  signal_id: string;
  event: {
    kind: string;
    time: number;
    referencePrice: number;
    side?: string;
    market?: string;
    [key: string]: unknown;
  };
  pair: string;
  exchange: string;
  revision: number;
  setup_name?: string;
  setup_market?: string;
  setup_side?: string;
  timeframe?: string;
  test?: boolean;
};
export const accents = { lime: "#D0F64C", cyan: "#65DCEB", violet: "#C8B5FF" };
export function signalBanner(accent: Appearance["accent"]) {
  return `snaap-signal-banner${accent === "lime" ? "" : "-" + accent}.png`;
}
export function channelAppearance(kind: string, input: unknown = {}) {
  return appearanceSchema.parse({
    layout: kind === "TELEGRAM" ? "minimal" : "card",
    ...(input && typeof input === "object" ? input : {}),
  });
}
export function publicBrandOrigin(origin: string) {
  try {
    const url = new URL(origin);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      isIP(url.hostname) ||
      !url.hostname.includes(".") ||
      /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
        url.hostname,
      ) ||
      /\.(local|internal|localhost)$/.test(url.hostname)
    )
      return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}
export function demoSignal(): Signal {
  return {
    signal_id: "00000000-0000-4000-8000-000000000002",
    pair: "BTC/USDT",
    exchange: "Binance",
    revision: 1,
    setup_name: "EMA pullback",
    setup_market: "Futures",
    setup_side: "LONG",
    timeframe: "1h",
    test: true,
    event: {
      kind: "ENTRY",
      time: Date.UTC(2026, 9, 4, 5, 30),
      referencePrice: 68420.5,
      side: "LONG",
    },
  };
}
const clean = (value: unknown, max = 120) =>
  String(value ?? "")
    .replace(/[\r\n\u0000-\u001f]/g, " ")
    .slice(0, max);
const discordText = (value: string) => value.replace(/([\\*_~`|<>])/g, "\\$1");
export function renderSignal(
  kind: string,
  signal: Signal,
  appearance: Appearance,
  origin: string,
) {
  const en = appearance.language === "en";
  const labels = en
    ? {
        ENTRY: "Entry signal",
        EXIT: "Exit signal",
        CANCEL: "Cancelled",
        EXPIRED: "Expired",
      }
    : {
        ENTRY: "สัญญาณเข้า",
        EXIT: "สัญญาณออก",
        CANCEL: "ยกเลิก",
        EXPIRED: "หมดเวลารอ",
      };
  const event =
    labels[signal.event.kind as keyof typeof labels] ??
    clean(signal.event.kind);
  const effectiveSide =
    signal.event.side ??
    ((signal.event.market ?? signal.setup_market) === "Spot"
      ? "SPOT"
      : signal.setup_side);
  const direction = en
    ? ((
        { LONG: "Long", SHORT: "Short", SPOT: "Spot (Buy)" } as Record<
          string,
          string
        >
      )[effectiveSide ?? ""] ?? "Unspecified direction")
    : signalDirection(signal.event, signal.setup_market, signal.setup_side);
  const title = `${clean(signal.pair, 50)} · ${direction}`;
  const heading =
    appearance.heading || (en ? "Signal alert" : "แจ้งเตือนสัญญาณ");
  const price = Number(signal.event.referencePrice).toLocaleString("en-US", {
    maximumFractionDigits: 10,
  });
  const time =
    new Date(signal.event.time).toLocaleString(en ? "en-GB" : "th-TH", {
      timeZone: "Asia/Bangkok",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }) + " (UTC+7)";
  const fields: { label: string; value: string }[] = [];
  fields.push({
    label: en ? "Market" : "ตลาด",
    value: `${clean(signal.exchange, 40)} · ${clean(signal.event.market ?? signal.setup_market ?? "", 30)}${signal.timeframe ? " · " + clean(signal.timeframe, 12) : ""}`,
  });
  if (appearance.showPrice)
    fields.push({
      label: en ? "Reference price" : "ราคาอ้างอิง",
      value: price,
    });
  if (appearance.showSetup)
    fields.push({
      label: en ? "Setup" : "เซตอัป",
      value: `${clean(signal.setup_name || "Setup", 70)} · v${signal.revision}`,
    });
  if (appearance.showTime)
    fields.push({ label: en ? "Time" : "เวลา", value: time });
  if (appearance.showId) fields.push({ label: "ID", value: signal.signal_id });
  const brand = publicBrandOrigin(origin);
  const url = brand ? brand + "/#notifications" : undefined;
  const image = brand
    ? brand + "/assets/" + signalBanner(appearance.accent)
    : undefined;
  const note = en
    ? "Signal only · No trade executed"
    : "สัญญาณเท่านั้น · ไม่ได้ส่งออเดอร์";
  const testLabel = signal.test ? (en ? "[TEST] " : "[ทดสอบ] ") : "";
  const text = [
    `${testLabel}Snaap · ${clean(heading, 60)}`,
    `${title} · ${event}`,
    ...fields.map((x) => `${x.label}: ${x.value}`),
    note,
    ...(url ? [url] : []),
  ].join("\n");
  let payload: any;
  if (kind === "LINE") {
    payload =
      appearance.layout === "minimal"
        ? { type: "text", text }
        : {
            type: "flex",
            altText: text.slice(0, 400),
            contents: {
              type: "bubble",
              size: "mega",
              header: {
                type: "box",
                layout: "vertical",
                backgroundColor: accents[appearance.accent],
                paddingAll: "20px",
                contents: [
                  {
                    type: "text",
                    text: `${testLabel}Snaap`,
                    weight: "bold",
                    size: "xl",
                    color: "#171A16",
                  },
                  {
                    type: "text",
                    text: clean(heading, 60),
                    size: "xs",
                    color: "#171A16",
                    wrap: true,
                  },
                ],
              },
              ...(image
                ? {
                    hero: {
                      type: "image",
                      url: image,
                      size: "full",
                      aspectRatio: "3:1",
                      aspectMode: "cover",
                    },
                  }
                : {}),
              body: {
                type: "box",
                layout: "vertical",
                spacing: "md",
                backgroundColor: "#FFFFFF",
                contents: [
                  {
                    type: "text",
                    text: title,
                    weight: "bold",
                    size: "lg",
                    color: "#171A16",
                    wrap: true,
                  },
                  { type: "text", text: event, size: "sm", color: "#555C52" },
                  ...fields.map((x) => ({
                    type: "box",
                    layout: "vertical",
                    spacing: "xs",
                    contents: [
                      {
                        type: "text",
                        text: x.label,
                        size: "xs",
                        color: "#777D73",
                      },
                      {
                        type: "text",
                        text: x.value,
                        size: "sm",
                        color: "#171A16",
                        wrap: true,
                      },
                    ],
                  })),
                ],
              },
              footer: {
                type: "box",
                layout: "vertical",
                spacing: "sm",
                contents: [
                  {
                    type: "text",
                    text: note,
                    size: "xxs",
                    color: "#777D73",
                    wrap: true,
                  },
                  ...(url
                    ? [
                        {
                          type: "button",
                          style: "secondary",
                          height: "sm",
                          action: {
                            type: "uri",
                            label: en ? "Open Snaap" : "เปิด Snaap",
                            uri: url,
                          },
                        },
                      ]
                    : []),
                ],
              },
            },
          };
  } else if (kind === "DISCORD") {
    payload = {
      username: "Snaap",
      allowed_mentions: { parse: [] },
      ...(appearance.layout === "minimal"
        ? { content: discordText(text).slice(0, 2000) }
        : {
            embeds: [
              {
                title: discordText(testLabel + title),
                description: discordText(event + " · " + heading),
                color: parseInt(accents[appearance.accent].slice(1), 16),
                fields: fields.map((x) => ({
                  name: x.label,
                  value: discordText(x.value) || "—",
                  inline: true,
                })),
                footer: { text: "Snaap · " + note },
                timestamp: new Date(signal.event.time).toISOString(),
                ...(url ? { url } : {}),
                ...(image ? { image: { url: image } } : {}),
              },
            ],
          }),
    };
  } else if (kind === "WEBHOOK") {
    payload = {
      type: "snaap.signal",
      version: 1,
      id: signal.signal_id,
      event: signal.event,
      pair: signal.pair,
      exchange: signal.exchange,
      revision: signal.revision,
      test: !!signal.test,
      presentation: {
        text,
        appearance,
        brand: "Snaap",
        ...(url ? { url } : {}),
        ...(image ? { image } : {}),
      },
    };
  } else
    payload = {
      text,
      link_preview_options: { is_disabled: true },
      ...(url
        ? {
            reply_markup: {
              inline_keyboard: [
                [{ text: en ? "Open Snaap" : "เปิด Snaap", url }],
              ],
            },
          }
        : {}),
    };
  return {
    text,
    title,
    event,
    fields,
    note,
    test: !!signal.test,
    accent: accents[appearance.accent],
    layout: appearance.layout,
    language: appearance.language,
    heading,
    brand: "Snaap",
    url,
    image,
    payload,
  };
}
