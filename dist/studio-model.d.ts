import type {
  Strategy,
  Condition,
  Operand,
  Evidence,
} from "../src/domain/engine.js";
export type ConditionRow = {
  condition: Condition;
  path: string;
  section: string;
  side: string;
  frames: string[];
};
export function conditionRows(spec: Strategy): ConditionRow[];
export function indicatorKey(operand: Operand): string;
export function indicatorUses(
  spec: Strategy,
): { operand: Operand; paths: string[]; conditions: string[] }[];
export function evidenceAtPath(
  bar: unknown,
  path: string,
  spec: Strategy,
): Evidence | undefined;
