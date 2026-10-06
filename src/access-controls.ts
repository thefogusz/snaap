import type pg from 'pg';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ApiError } from './errors.js';
import { transaction } from './data/db.js';
import { usagePolicy } from './usage-policy.js';
import { isAdminIdentity } from './admin-access.js';
import { auditAdmin } from './admin-events.js';

type DB = Pick<pg.Pool, 'query'>;
type Feature = 'account' | 'ai' | 'automation' | 'notifications';
export async function userRestriction(db: DB, owner: string) {
  const row = (await db.query(`SELECT scope,reason,until_at,revision,
    (scope<>'none' AND (until_at IS NULL OR until_at>now())) AS active
    FROM user_restrictions WHERE owner_id=$1`, [owner])).rows[0];
  return row ?? {scope:'none',reason:'',until_at:null,revision:0,active:false};
}
export async function accessBlocked(db: DB, owner: string, feature: Feature) {
  const restriction = await userRestriction(db, owner);
  if (restriction.active && (restriction.scope === 'all' || restriction.scope === feature))
    return {code:'ACCOUNT_RESTRICTED', message:'การใช้งานส่วนนี้ถูกระงับโดยผู้ดูแล กรุณาติดต่อทีม SNAAP'};
  if (feature !== 'account' && !(await usagePolicy(db)).services[feature])
    return {code:'SERVICE_PAUSED',message:'ผู้ดูแลพักบริการส่วนนี้ชั่วคราว กรุณาลองใหม่ภายหลัง'};
  return null;
}
export async function assertAccess(db: DB, owner: string, feature: Feature) {
  const blocked = await accessBlocked(db,owner,feature);
  if (blocked) throw new ApiError(403,blocked.code,blocked.message);
}

// registerAdmin's hook protects both reads and writes. Reasons remain admin-only.
export function registerAccessControls(app: FastifyInstance, db: pg.Pool) {
  const params = z.object({userId:z.string().uuid()});
  app.get('/api/v1/admin/users/:userId/restriction', async req => {
    const {userId} = params.parse(req.params);
    if (!(await db.query('SELECT id FROM users WHERE id=$1',[userId])).rowCount)
      throw new ApiError(404,'USER_NOT_FOUND','ไม่พบผู้ใช้');
    return userRestriction(db,userId);
  });
  app.post('/api/v1/admin/users/:userId/restriction', async req => {
    const {userId} = params.parse(req.params);
    const input = z.object({
      scope:z.enum(['none','all','ai','automation','notifications']),
      durationMinutes:z.union([z.literal(60),z.literal(1440),z.literal(10080),z.null()]),
      reason:z.string().trim().min(3).max(300),
      expectedRevision:z.number().int().nonnegative(),
    }).strict().parse(req.body);
    return transaction(db,async c => {
      const user = (await c.query('SELECT id,email,google_sub,role FROM users WHERE id=$1 FOR UPDATE',[userId])).rows[0];
      if (!user) throw new ApiError(404,'USER_NOT_FOUND','ไม่พบผู้ใช้');
      if (userId === req.userId || isAdminIdentity(user))
        throw new ApiError(409,'ADMIN_PROTECTED','ไม่สามารถระงับบัญชีผู้ดูแล');
      await c.query('INSERT INTO user_restrictions(owner_id) VALUES($1) ON CONFLICT DO NOTHING',[userId]);
      const before = await userRestriction(c,userId);
      if (before.revision !== input.expectedRevision)
        throw new ApiError(409,'REVISION_CONFLICT','สถานะถูกเปลี่ยนแล้ว กรุณาเปิดใหม่ก่อนบันทึก');
      await c.query(`UPDATE user_restrictions SET scope=$2,reason=$3,
        until_at=CASE WHEN $2='none' OR $4::int IS NULL THEN NULL ELSE now()+$4*interval '1 minute' END,
        revision=revision+1,updated_at=now() WHERE owner_id=$1`,[userId,input.scope,input.reason,input.durationMinutes]);
      // All-account suspension revokes existing sessions; lifting it requires a new login.
      if (input.scope === 'all') await c.query('DELETE FROM sessions WHERE user_id=$1',[userId]);
      // Do not lock deliveries while holding users: delivery quota checks lock in the opposite order.
      // Held deliveries are rechecked by the worker within a minute, without replaying old alerts.
      const after = await userRestriction(c,userId);
      await auditAdmin(c,req.userId,'user.restriction.update',userId,{before,after});
      return after;
    });
  });
}
