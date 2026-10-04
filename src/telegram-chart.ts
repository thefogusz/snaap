import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { accents, type Appearance } from "./notification-format.js";

/** Telegram photos share the same brand frame in preview and delivery. */
export async function telegramChartPng(
  chart: Buffer,
  accent: Appearance["accent"],
) {
  const width = 1024,
    padding = 24,
    header = 84;
  const plot = await sharp(chart)
    .resize({ width: width - padding * 2 })
    .png()
    .toBuffer();
  const metadata = await sharp(plot).metadata();
  const height = header + metadata.height! + padding;
  const symbol = await sharp(
    await readFile(
      new URL("../dist/assets/snaap-favicon.svg", import.meta.url),
    ),
  )
    .resize(44, 44)
    .png()
    .toBuffer();
  const frame = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" rx="20" fill="#151515"/><rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="19" fill="none" stroke="#303030"/><path d="M24 3H1000" stroke="${accents[accent]}" stroke-width="4"/><text x="84" y="54" font-family="Arial,sans-serif" font-size="30" font-weight="700" fill="#F4F4F5">snaap.me</text></svg>`,
  );
  return sharp(frame)
    .composite([
      { input: symbol, left: padding, top: 20 },
      { input: plot, left: padding, top: header },
    ])
    .png()
    .toBuffer();
}
