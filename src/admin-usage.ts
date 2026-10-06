import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import { ApiError } from './errors.js';

// These routes share registerAdmin's authentication hook. Reports contain counts, not chat content.
export function registerAdminUsage(app: FastifyInstance, db: pg.Pool) {
  app.get('/api/v1/admin/users/:userId/usage', async req => {
    const {userId} = z.object({userId:z.string().uuid()}).parse(req.params);
    const {before} = z.object({before:z.string().uuid().optional()}).parse(req.query);
    if (!(await db.query('SELECT id FROM users WHERE id=$1',[userId])).rowCount)
      throw new ApiError(404,'USER_NOT_FOUND','ไม่พบผู้ใช้');
    const [totals, setups] = await Promise.all([
      db.query(`SELECT
        (SELECT count(*)::int FROM usage_ledger WHERE owner_id=$1 AND status='COMPLETED') AS ai_completed,
        (SELECT count(*)::int FROM usage_ledger WHERE owner_id=$1 AND status='REFUNDED') AS ai_failed,
        (SELECT COALESCE(sum(input_tokens),0) FROM usage_ledger WHERE owner_id=$1) AS input_tokens,
        (SELECT COALESCE(sum(output_tokens),0) FROM usage_ledger WHERE owner_id=$1) AS output_tokens,
        (SELECT COALESCE(sum(estimated_usd),0) FROM usage_ledger WHERE owner_id=$1) AS estimated_usd,
        (SELECT count(*)::int FROM rules WHERE owner_id=$1 AND active AND deleted_at IS NULL) AS active_setups,
        (SELECT count(*)::int FROM rules WHERE owner_id=$1 AND deleted_at IS NULL) AS total_setups,
        (SELECT count(*)::int FROM workspaces WHERE owner_id=$1) AS workspaces,
        (SELECT count(*)::int FROM signals WHERE owner_id=$1 AND event->>'kind' IS DISTINCT FROM 'EXPIRED') AS signals,
        (SELECT count(*)::int FROM deliveries d JOIN signals s ON s.id=d.signal_id WHERE s.owner_id=$1 AND d.status IN ('SENT','DELIVERED')) AS notifications_sent,
        (SELECT count(*)::int FROM deliveries d JOIN signals s ON s.id=d.signal_id WHERE s.owner_id=$1 AND d.status IN ('FAILED','AMBIGUOUS','DISCONNECTED','QUOTA_OR_RATE_LIMIT','UNKNOWN')) AS notifications_failed,
        (SELECT count(*)::int FROM deliveries d JOIN signals s ON s.id=d.signal_id WHERE s.owner_id=$1 AND d.status IN ('PENDING','RETRY','USAGE_LIMIT')) AS notifications_pending`,[userId]),
      db.query(`SELECT r.id,r.spec->>'name' AS name,r.active,r.deleted_at IS NOT NULL AS deleted,
        (SELECT count(*)::int FROM signals s WHERE s.rule_id=r.id AND s.owner_id=$1 AND s.event->>'kind' IS DISTINCT FROM 'EXPIRED') AS signals,
        (SELECT count(*)::int FROM deliveries d JOIN signals s ON s.id=d.signal_id WHERE s.rule_id=r.id AND s.owner_id=$1 AND d.status IN ('SENT','DELIVERED')) AS notifications_sent
        FROM rules r WHERE r.owner_id=$1 AND ($2::uuid IS NULL OR r.id>$2) ORDER BY r.id LIMIT 21`,[userId,before ?? null]),
    ]);
    return {period:'all', totals:Object.fromEntries(Object.entries(totals.rows[0]).map(([key,value])=>[key,Number(value)])),setups:setups.rows.slice(0,20),nextCursor:setups.rows.length>20?setups.rows[19].id:null};
  });
}
