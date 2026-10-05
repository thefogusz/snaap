import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { z } from "zod";
import { transaction } from "./data/db.js";
import { ApiError } from "./errors.js";
import { strategySchema, entryMatchPercentSchema } from "./domain/engine.js";

export function registerEntryFlexibility(app: FastifyInstance, db: pg.Pool) {
  app.put("/api/v1/rules/:id/entry-flexibility", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const input = z
      .object({
        expectedRevision: z.number().int().positive(),
        entryMatchPercent: entryMatchPercentSchema,
      })
      .strict()
      .parse(req.body);
    return transaction(db, async (c) => {
      const row = (
        await c.query(
          "SELECT * FROM rules WHERE id=$1 AND owner_id=$2 AND revision=$3 AND deleted_at IS NULL AND ($4::uuid IS NULL OR workspace_id=$4) FOR UPDATE",
          [id, req.userId, input.expectedRevision, req.workspaceId ?? null],
        )
      ).rows[0];
      if (!row)
        throw new ApiError(
          409,
          "REVISION_CONFLICT",
          "รายการเปลี่ยนแล้วหรือไม่พบ กรุณาโหลดใหม่",
        );
      const spec = strategySchema.parse(row.spec);
      if ((spec.entryMatchPercent ?? 100) === input.entryMatchPercent)
        return row;
      if (input.entryMatchPercent === 100) delete spec.entryMatchPercent;
      else spec.entryMatchPercent = input.entryMatchPercent;
      const saved = (
        await c.query(
          "UPDATE rules SET spec=$1,revision=revision+1,updated_at=now(),activated_at=CASE WHEN active THEN now() ELSE activated_at END WHERE id=$2 RETURNING *",
          [spec, id],
        )
      ).rows[0];
      await c.query(
        "INSERT INTO rule_revisions(rule_id,revision,spec) VALUES($1,$2,$3)",
        [id, saved.revision, spec],
      );
      await c.query("DELETE FROM monitor_checkpoints WHERE rule_id=$1", [id]);
      await c.query("DELETE FROM monitor_status WHERE rule_id=$1", [id]);
      return saved;
    });
  });
}
