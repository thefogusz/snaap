import type pg from 'pg';
import { z } from 'zod';

const cap = z.number().int().min(0).max(10000000).nullable();
const plan = z.object({
  activeRules: cap,
  standard: cap,
  deep: cap,
  workspaces: cap.refine(value => value === null || value >= 1),
  lineUser: cap,
  notifications: cap,
}).strict();
export const usagePolicySchema = z.object({
  mode: z.enum(['unified','plans']).default('unified'),
  unified: plan.default({activeRules:null,standard:null,deep:null,workspaces:3,lineUser:null,notifications:null}),
  free: plan.default({activeRules: 6, standard: 20, deep: 0,workspaces:3,lineUser:30,notifications:null}),
  pro: plan.default({activeRules: 20, standard: 100, deep: 10,workspaces:3,lineUser:30,notifications:null}),
  lineTotal: cap.default(null),
}).strict();
export type UsagePolicy = z.infer<typeof usagePolicySchema>;
type Queryable = Pick<pg.Pool, 'query'>;
export async function usagePolicy(db: Queryable) {
  const row = (await db.query('SELECT policy,revision FROM usage_policy WHERE id=1')).rows[0];
  return { ...usagePolicySchema.parse(row?.policy ?? {}), revision: row?.revision ?? 0 };
}
export async function userLimits(db: Queryable, owner: string) {
  const policy = await usagePolicy(db);
  if (policy.mode === "unified") return policy.unified;
  const pro = !!(await db.query('SELECT 1 FROM entitlements WHERE owner_id=$1 AND pro_until>now()', [owner])).rowCount;
  return policy[pro ? 'pro' : 'free'];
}
export async function monitorQuotaBlocked(db: Queryable, owner: string) {
  const { activeRules } = await userLimits(db, owner);
  if (activeRules === null) return false;
  const result = await db.query('SELECT count(*)::int AS n FROM rules WHERE owner_id=$1 AND active AND deleted_at IS NULL', [owner]);
  return Number(result.rows[0].n) > activeRules;
}
