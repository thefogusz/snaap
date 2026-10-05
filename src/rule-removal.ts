import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { z } from "zod";
import { transaction } from "./data/db.js";
import { ApiError } from "./errors.js";

export function registerRuleRemoval(app: FastifyInstance, db: pg.Pool) {
  app.delete("/api/v1/rules/:id", async req => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { expectedRevision } = z.object({ expectedRevision: z.number().int().positive() }).strict().parse(req.body);
    return transaction(db, async client => {
      const result = await client.query(
        "UPDATE rules SET active=false,deleted_at=now(),revision=revision+1,updated_at=now() WHERE id=$1 AND owner_id=$2 AND revision=$3 AND deleted_at IS NULL AND ($4::uuid IS NULL OR workspace_id=$4) RETURNING id",
        [id, req.userId, expectedRevision, req.workspaceId ?? null],
      );
      if (!result.rowCount) throw new ApiError(409, "REVISION_CONFLICT", "เซ็ตอัพเปลี่ยนแล้วหรือถูกลบ กรุณาโหลดใหม่");
      await client.query("UPDATE conversations SET saved_rule_id=NULL,setup_saved_at=NULL,setup_status_known=true WHERE owner_id=$1 AND saved_rule_id=$2", [req.userId, id]);
      await client.query("UPDATE messages SET ui_card=jsonb_set(ui_card,'{ruleId}','null'::jsonb) WHERE ui_card->>'ruleId'=$1 AND conversation_id IN (SELECT id FROM conversations WHERE owner_id=$2)", [id, req.userId]);
      await client.query("UPDATE deliveries SET status='CANCELLED',detail='เซ็ตอัพถูกลบแล้ว' WHERE status IN ('PENDING','RETRY') AND signal_id IN (SELECT id FROM signals WHERE rule_id=$1 AND owner_id=$2)", [id, req.userId]);
      return { id, deleted: true };
    });
  });
}
