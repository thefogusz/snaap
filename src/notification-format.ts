import { z } from "zod";
import { isIP } from "node:net";
import { signalDirection } from "../dist/trade-direction.js";
import { demoChart, type ChartSnapshot } from "./signal-chart.js";

export const channelKind = z.enum(["TELEGRAM", "LINE", "DISCORD", "WEBHOOK"]);
export const appearanceSchema = z
  .object({
    layout: z.enum(["card", "minimal"]).default("card"),
    accent: z.enum(["lime", "cyan", "violet"]).default("lime"),
    language: z.enum(["th", "en"]).default("th"),
    heading: z.string().trim().max(35).default(""),
    showPrice: z.boolean().default(true),
    showSetup: z.boolean().default(true),
    showTime: z.boolean().default(true),
    showId: z.boolean().default(false),
    showCreator: z.boolean().default(false),
    creatorName: z.string().trim().max(13).default(""),
    showChart: z.boolean().default(true),
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
  chart?: ChartSnapshot;
};
export const accents = { lime: "#D0F64C", cyan: "#65DCEB", violet: "#C8B5FF" };
export function signalBanner(accent: Appearance["accent"]) {
  return `snaap-signal-banner${accent === "lime" ? "" : "-" + accent}.png`;
}
export function channelAppearance(kind: string, input: unknown = {}) {
  const saved =
    input && typeof input === "object"
      ? ({ ...input } as Record<string, unknown>)
      : {};
  // Older saved appearances allowed longer labels; preserve their other settings.
  if (typeof saved.heading === "string")
    saved.heading = saved.heading.trim().slice(0, 35);
  if (typeof saved.creatorName === "string")
    saved.creatorName = saved.creatorName.trim().slice(0, 13);
  return appearanceSchema.parse({
    layout: kind === "TELEGRAM" ? "minimal" : "card",
    ...saved,
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
    chart: demoChart(Date.UTC(2026, 9, 4, 5, 30)),
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
  graphUrl?: string,
) {
  if (appearance.layout === "minimal")
    appearance = { ...appearance, showChart: false };
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
  const pair = clean(signal.pair, 50);
  const directionBadge =
    effectiveSide === "SHORT"
      ? {
          label: en ? "SHORT" : "SHORT · ขาย",
          color: "#FF909A",
          background: "#44262F",
        }
      : effectiveSide === "LONG" || effectiveSide === "SPOT"
        ? {
            label:
              effectiveSide === "SPOT"
                ? en
                  ? "BUY"
                  : "ซื้อ"
                : en
                  ? "LONG"
                  : "LONG · ซื้อ",
            color: "#67E2B1",
            background: "#173D32",
          }
        : {
            label: en ? "UNSPECIFIED" : "ไม่ระบุฝั่ง",
            color: "#C3CCD6",
            background: "#29323D",
          };
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
  const fields: { label: string; value: string; key?: string }[] = [];
  fields.push({
    label: en ? "Market" : "ตลาด",
    value: `${clean(signal.exchange, 40)} · ${clean(signal.event.market ?? signal.setup_market ?? "", 30)}${signal.timeframe ? " · " + clean(signal.timeframe, 12) : ""}`,
  });
  if (appearance.showPrice)
    fields.push({
      label: en ? "Reference price" : "ราคาอ้างอิง",
      key: "referencePrice",
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
  const signature = appearance.showCreator
    ? clean(appearance.creatorName, 13)
    : "";
  const brand = publicBrandOrigin(origin);
  const url = brand ? brand + "/#notifications" : undefined;
  const image =
    appearance.layout === "minimal"
      ? undefined
      : appearance.showChart && graphUrl
        ? graphUrl
        : brand
          ? brand + "/assets/" + signalBanner(appearance.accent)
          : undefined;
  const testLabel =
    signal.test && appearance.layout === "minimal"
      ? en
        ? "[TEST] "
        : "[ทดสอบ] "
      : "";
  const marker =
    signal.event.kind === "CANCEL" || signal.event.kind === "EXPIRED"
      ? "⚪"
      : signal.event.kind === "EXIT"
        ? "🟡"
        : effectiveSide === "SHORT"
          ? "🔴"
          : effectiveSide === "LONG" || effectiveSide === "SPOT"
            ? "🟢"
            : "⚪";
  const text = [
    `${testLabel}Snaap · ${clean(heading, 35)}`,
    `${appearance.layout === "minimal" || kind === "TELEGRAM" ? marker + " " : ""}${title} · ${event}`,
    ...fields.map((x) => `${x.label}: ${x.value}`),
    ...(url && appearance.layout === "card" && kind !== "TELEGRAM"
      ? [url]
      : []),
    ...(signature ? [signature] : []),
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
              size: "kilo",
              header: {
                type: "box",
                layout: "horizontal",
                backgroundColor: "#151515",
                paddingAll: "10px",
                spacing: "sm",
                contents: [
                  {
                    type: "box",
                    layout: "horizontal",
                    alignItems: "center",
                    spacing: "xs",
                    flex: 0,
                    contents: [
                      ...(brand
                        ? [
                            {
                              type: "image",
                              url: brand + "/assets/snaap-card-symbol.png",
                              size: "22px",
                              aspectRatio: "1:1",
                              aspectMode: "fit",
                              flex: 0,
                            },
                          ]
                        : []),
                      {
                        type: "text",
                        text: "snaap.me",
                        weight: "bold",
                        size: "lg",
                        flex: 0,
                        color: "#F4F4F5",
                      },
                    ],
                  },
                  ...(signature
                    ? [
                        {
                          type: "text",
                          text: signature,
                          size: "sm",
                          align: "end",
                          color: "#B9C3D0",
                          wrap: true,
                          flex: 1,
                        },
                      ]
                    : []),
                ],
              },
              ...(image
                ? {
                    hero: {
                      type: "image",
                      url: image,
                      size: "full",
                      aspectRatio:
                        appearance.showChart && graphUrl ? "5:3" : "3:1",
                      aspectMode: "cover",
                      action: { type: "uri", uri: image },
                    },
                  }
                : {}),
              body: {
                type: "box",
                layout: "vertical",
                spacing: "sm",
                paddingAll: "12px",
                backgroundColor: "#151515",
                contents: [
                  ...(appearance.heading
                    ? [
                        {
                          type: "text",
                          text: clean(appearance.heading, 35),
                          size: "sm",
                          weight: "bold",
                          color: "#F4F4F5",
                          wrap: true,
                        },
                      ]
                    : []),
                  {
                    type: "box",
                    layout: "horizontal",
                    alignItems: "center",
                    spacing: "sm",
                    contents: [
                      {
                        type: "text",
                        text: pair,
                        weight: "bold",
                        size: "lg",
                        color: "#F4F7FB",
                        wrap: true,
                        flex: 1,
                      },
                      {
                        type: "box",
                        layout: "vertical",
                        flex: 0,
                        paddingAll: "6px",
                        cornerRadius: "6px",
                        backgroundColor: directionBadge.background,
                        contents: [
                          {
                            type: "text",
                            text: directionBadge.label,
                            weight: "bold",
                            size: "sm",
                            color: directionBadge.color,
                            align: "center",
                          },
                        ],
                      },
                    ],
                  },
                  {
                    type: "text",
                    text: event,
                    size: "sm",
                    color: accents[appearance.accent],
                  },
                  ...fields.map((x) => ({
                    type: "box",
                    layout: "baseline",
                    spacing: "sm",
                    contents: [
                      {
                        type: "text",
                        text: x.label,
                        size: "sm",
                        scaling: true,
                        flex: 2,
                        wrap: true,
                        color: "#B9C3D0",
                      },
                      {
                        type: "text",
                        text: x.value,
                        size: "sm",
                        scaling: true,
                        flex: 5,
                        align: "end",
                        color:
                          x.key === "referencePrice" ? "#D0F64C" : "#F4F7FB",
                        weight: x.key === "referencePrice" ? "bold" : "regular",
                        wrap: true,
                      },
                    ],
                  })),
                ],
              },
            },
          };
  } else if (kind === "DISCORD") {
    payload = {
      username: "Snaap",
      allowed_mentions: { parse: [] },
      ...(appearance.layout === "minimal"
        ? {
            content: discordText(text).slice(0, 2000),
            flags: 4,
          }
        : {
            embeds: [
              {
                author: {
                  name: "snaap.me",
                  icon_url: brand
                    ? brand + "/assets/snaap-card-symbol.png"
                    : "attachment://snaap-card-symbol.png",
                  ...(brand ? { url: brand } : {}),
                },
                title: discordText(testLabel + title),
                description: discordText(
                  (appearance.heading ? heading + "\n" : "") + event,
                ),
                color: parseInt(accents[appearance.accent].slice(1), 16),
                fields: fields.map((x) => ({
                  name: x.label,
                  value: discordText(x.value) || "—",
                  inline: true,
                })),
                ...(signature
                  ? { footer: { text: discordText(signature) } }
                  : {}),
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
        heading: appearance.heading,
        signature,
        fields,
        directionBadge,
        accent: accents[appearance.accent],
        brandName: "snaap.me",
        pair,
        event,
        ...(brand
          ? { brandLogo: brand + "/assets/snaap-card-symbol.png" }
          : {}),
        card:
          appearance.layout === "card"
            ? {
                background: "#151515",
                brandName: "snaap.me",
                ...(brand
                  ? { brandLogo: brand + "/assets/snaap-card-symbol.png" }
                  : {}),
                heading: appearance.heading,
                signature,
                pair,
                event,
                directionBadge,
                fields,
                accent: accents[appearance.accent],
                ...(image ? { image } : {}),
              }
            : undefined,
        appearance: {
          ...appearance,
          creatorName: appearance.showCreator ? appearance.creatorName : "",
        },
        brand: "Snaap",
        ...(url ? { url } : {}),
        ...(image ? { image } : {}),
        ...(appearance.showChart && signal.chart
          ? { chart: signal.chart }
          : {}),
      },
    };
  } else
    payload = {
      text,
      link_preview_options: { is_disabled: true },
      ...(url && appearance.layout === "card"
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
    pair,
    directionBadge,
    event,
    fields,
    test: !!signal.test,
    accent: accents[appearance.accent],
    layout: appearance.layout,
    language: appearance.language,
    heading,
    signature,
    brand: "Snaap",
    url,
    image,
    payload,
  };
}
