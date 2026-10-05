import type { Condition } from "../src/domain/engine.js";
export function entryUnits(condition: Condition): Condition[];
export function flexibilityCounts(
  entry: Condition,
  percent?: number,
): { total: number; needed: number };
