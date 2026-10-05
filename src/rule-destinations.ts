import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { z } from "zod";
import { transaction } from "./data/db.js";
import { ApiError } from "./errors.js";
import { strategySchema } from "./domain/engine.js";

export function registerRuleDestinations(app: FastifyInstance, db: pg.Pool) {
  app.put("/api/v1/rules/:id/destinations", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const input = z.object({
      expectedRevision: z.number().int().positive(),
      destinations: z.array(z.string().uuid()).max(5).refine(ids => new Set(ids).size === ids.length),
    }).strict().parse(req.body);
    return transaction(db, async (c) => {
      const row = (await c.query(
        "SELECT * FROM rules WHERE id=$1 AND owner_id=$2 AND revision=$3 AND deleted_at IS NULL AND ($4::uuid IS NULL OR workspace_id=$4) FOR UPDATE",
        [id, req.userId, input.expectedRevision, req.workspaceId ?? null],
      )).rows[0];
      if (!row) throw new ApiError(409, "REVISION_CONFLICT", "รายการเปลี่ยนแล้วหรือไม่พบ กรุณาโหลดใหม่");
      const verified = await c.query(
        "SELECT id FROM destinations WHERE owner_id=$1 AND id=ANY($2::uuid[]) AND verified",
        [req.userId, input.destinations],
      );
      if (verified.rowCount !== input.destinations.length)
        throw new ApiError(400, "DESTINATION_UNVERIFIED", "เลือกช่องทางที่เชื่อมและยืนยันแล้ว");
      const spec = strategySchema.parse(row.spec);
      if (JSON.stringify([...spec.destinations].sort()) === JSON.stringify([...input.destinations].sort())) return row;
      spec.destinations = input.destinations;
      const saved = (await c.query(
        "UPDATE rules SET spec=$1,revision=revision+1,updated_at=now() WHERE id=$2 RETURNING *",
        [spec, id],
      )).rows[0];
      await c.query("INSERT INTO rule_revisions(rule_id,revision,spec) VALUES($1,$2,$3)", [id, saved.revision, spec]);
      // Only routing changed: retain lifecycle and processed candles across the revision.
      await c.query("UPDATE monitor_checkpoints SET revision=$2 WHERE rule_id=$1 AND revision=$3", [id, saved.revision, row.revision]);
      return saved;
    });
  });
}
