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
  services: z.object({ai:z.boolean().default(true),automation:z.boolean().default(true),notifications:z.boolean().default(true)}).strict().default({ai:true,automation:true,notifications:true}),
  requestsPerMinute: z.number().int().min(30).max(600).default(180),
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
/** One policy/access snapshot per target; workers must recheck inside their commit transaction. */
export async function monitorAccess(db: Queryable, owner: string) {
  const row = (await db.query(`WITH settings AS (
    SELECT coalesce((SELECT policy FROM usage_policy WHERE id=1),'{}'::jsonb) AS policy
  ) SELECT policy,
    EXISTS(SELECT 1 FROM user_restrictions WHERE owner_id=$1 AND scope IN ('all','automation')
      AND (until_at IS NULL OR until_at>now())) AS restricted,
    CASE WHEN policy->>'mode'='plans' THEN
      EXISTS(SELECT 1 FROM entitlements WHERE owner_id=$1 AND pro_until>now()) ELSE false END AS pro,
    CASE WHEN coalesce(policy->>'mode','unified')='unified'
      AND coalesce(policy#>'{unified,activeRules}','null'::jsonb)='null'::jsonb THEN 0
      ELSE (SELECT count(*)::int FROM rules WHERE owner_id=$1 AND active AND deleted_at IS NULL)
    END AS active_count FROM settings`, [owner])).rows[0];
  const policy = usagePolicySchema.parse(row.policy);
  const limits = policy.mode === 'unified' ? policy.unified : policy[row.pro ? 'pro' : 'free'];
  return {
    restricted: row.restricted || !policy.services.automation,
    quotaBlocked: limits.activeRules !== null && row.active_count > limits.activeRules,
  };
}
