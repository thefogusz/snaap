import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import { transaction } from './data/db.js';
import { ApiError } from './errors.js';

export function registerConversationRemoval(app: FastifyInstance, db: pg.Pool) {
  app.delete('/api/v1/conversations/:id', async req => {
    const {id} = z.object({id: z.string().uuid()}).parse(req.params);
    return transaction(db, async client => {
      const row = (await client.query(
        'SELECT id,saved_rule_id FROM conversations WHERE id=$1 AND owner_id=$2 AND ($3::uuid IS NULL OR workspace_id=$3) FOR UPDATE',
        [id, req.userId, req.workspaceId ?? null],
      )).rows[0];
      if (!row) throw new ApiError(404, 'NOT_FOUND', 'ไม่พบบทสนทนา');
      if ((await client.query("SELECT 1 FROM agent_runs WHERE conversation_id=$1 AND status='RUNNING' AND created_at>now()-interval '5 minutes'", [id])).rowCount)
        throw new ApiError(409, 'CONVERSATION_BUSY', 'บทสนทนานี้กำลังประมวลผล กรุณารอให้เสร็จก่อนลบ');
      const rules = (await client.query(
        "UPDATE rules SET active=false,deleted_at=now(),revision=revision+1,updated_at=now() WHERE owner_id=$2 AND deleted_at IS NULL AND (id=$3::uuid OR id::text IN (SELECT ui_card->>'ruleId' FROM messages WHERE conversation_id=$1)) RETURNING id",
        [id, req.userId, row.saved_rule_id],
      )).rows;
      const ruleIds = rules.map(rule => rule.id);
      if (ruleIds.length) {
        await client.query('UPDATE conversations SET saved_rule_id=NULL,setup_saved_at=NULL,setup_status_known=true WHERE owner_id=$1 AND saved_rule_id=ANY($2::uuid[])', [req.userId, ruleIds]);
        await client.query("UPDATE messages SET ui_card=jsonb_set(ui_card,'{ruleId}','null'::jsonb) WHERE ui_card->>'ruleId'=ANY($2::text[]) AND conversation_id IN (SELECT id FROM conversations WHERE owner_id=$1)", [req.userId, ruleIds]);
        await client.query("UPDATE deliveries SET status='CANCELLED',detail='เซ็ตอัพถูกลบแล้ว' WHERE status IN ('PENDING','RETRY') AND signal_id IN (SELECT id FROM signals WHERE owner_id=$1 AND rule_id=ANY($2::uuid[]))", [req.userId, ruleIds]);
      }
      await client.query("WITH removed AS (DELETE FROM assets WHERE conversation_id=$1 AND purpose='chat' RETURNING id,storage_path) INSERT INTO asset_cleanup(id,storage_path) SELECT id,storage_path FROM removed ON CONFLICT DO NOTHING", [id]);
      await client.query('UPDATE assets SET conversation_id=NULL WHERE conversation_id=$1', [id]);
      await client.query('DELETE FROM messages WHERE conversation_id=$1', [id]);
      await client.query('DELETE FROM agent_runs WHERE conversation_id=$1', [id]);
      await client.query('DELETE FROM conversations WHERE id=$1 AND owner_id=$2', [id, req.userId]);
      return {id, deleted: true, ruleIds};
    });
  });
}
