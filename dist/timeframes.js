// Native exchange intervals supported by Snaap. Minimum 5m, maximum 1w.
export const TIMEFRAMES = ["5m", "15m", "30m", "1h", "2h", "4h", "6h", "8h", "12h", "1d", "1w"];
export const FRAME_MS = { "5m": 300000, "15m": 900000, "30m": 1800000, "1h": 3600000, "2h": 7200000, "4h": 14400000, "6h": 21600000, "8h": 28800000, "12h": 43200000, "1d": 86400000, "1w": 604800000 };
const native = {
  Binance: TIMEFRAMES,
  Bybit: TIMEFRAMES.filter(t => t !== "8h"),
  OKX: TIMEFRAMES.filter(t => t !== "8h"),
  Bitget: TIMEFRAMES.filter(t => t !== "8h"),
  MEXC: ["5m", "15m", "30m", "1h", "4h", "8h", "1d", "1w"],
  Gate: ["5m", "15m", "30m", "1h", "2h", "4h", "8h", "1d", "1w"],
};
export function availableTimeframes(exchanges = ["Binance"], market = "Spot") {
  return TIMEFRAMES.filter(frame => exchanges.every(exchange =>
    native[exchange]?.includes(frame) &&
    // Gate perpetual weekly bars start Thursday; the engine evaluates Monday weeks.
    !(exchange === "Gate" && market !== "Spot" && frame === "1w") &&
    !(market === "Spot" && ((exchange === "Bitget" && frame === "2h") || (exchange === "MEXC" && frame === "8h")))
  ));
}
// Exchanges start UTC weekly candles on Monday. Unix epoch starts on Thursday.
export function lastClosedBoundary(time, frame) {
  const duration = FRAME_MS[frame];
  const offset = frame === "1w" ? 4 * FRAME_MS["1d"] : 0;
  return Math.floor((time - offset) / duration) * duration + offset;
}
