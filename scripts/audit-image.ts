import sharp from "sharp";
import { mkdir } from "node:fs/promises";
await mkdir(".local/audit", { recursive: true });
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="800" height="450" fill="#121826"/><text x="40" y="45" fill="white" font-size="24">SYNTHETIC TEST — NOT MARKET DATA</text><text x="40" y="90" fill="white" font-size="20">BTC/USDT 1h | EMA 200 | RSI 14</text><polyline points="40,250 120,220 200,260 280,170 360,180 440,130 520,160 600,100 740,140" stroke="#3dfca8" stroke-width="4" fill="none"/><line x1="40" y1="240" x2="740" y2="185" stroke="#ffaa22" stroke-width="3"/><text x="40" y="390" fill="white" font-size="18">No exchange, timestamp or RSI values supplied</text></svg>';
await sharp(Buffer.from(svg)).png().toFile(".local/audit/synthetic-chart.png");
console.log("Created synthetic chart fixture");
