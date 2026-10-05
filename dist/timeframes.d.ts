export type Timeframe = "5m" | "15m" | "30m" | "1h" | "2h" | "4h" | "6h" | "8h" | "12h" | "1d" | "1w";
export const TIMEFRAMES: ["5m", "15m", "30m", "1h", "2h", "4h", "6h", "8h", "12h", "1d", "1w"];
export const FRAME_MS: Record<Timeframe, number>;
export function availableTimeframes(exchanges?: readonly string[], market?: string): Timeframe[];
export function lastClosedBoundary(time: number, frame: Timeframe): number;
