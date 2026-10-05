import { frames } from "./domain/engine.js";

/** Signal time is the confirmed candle close, not the notification delivery time. */
export function signalValidUntil(
  event: { kind: string; time: unknown },
  timeframe: unknown,
): number | null {
  if (
    !["ENTRY", "EXIT"].includes(event.kind) ||
    typeof event.time !== "number" ||
    !Number.isFinite(event.time)
  )
    return null;
  if (typeof timeframe !== "string" || !Object.hasOwn(frames, timeframe))
    return null;
  const deadline = event.time + frames[timeframe as keyof typeof frames];
  return Number.isSafeInteger(deadline) && deadline > 0 ? deadline : null;
}
