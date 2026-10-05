import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { z } from "zod";
import { riskPlanSchema } from "./domain/outcomes.js";
import { transaction } from "./data/db.js";
import { ApiError } from "./errors.js";
export function registerRiskPlans(app: FastifyInstance, db: pg.Pool) {
  app.put("/api/v1/rules/:id/risk-plan", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const input = z
      .object({
        expectedRevision: z.number().int().positive(),
        riskPlan: riskPlanSchema,
      })
      .strict()
      .parse(req.body);
    return transaction(db, async (c) => {
      const rule = (
        await c.query(
          "SELECT * FROM rules WHERE deleted_at IS NULL AND id=$1 AND owner_id=$2 AND ($3::uuid IS NULL OR workspace_id=$3) FOR UPDATE",
          [id, req.userId, req.workspaceId ?? null],
        )
      ).rows[0];
      if (!rule) throw new ApiError(404, "NOT_FOUND", "ไม่พบเซตอัป");
      if (rule.revision !== input.expectedRevision)
        throw new ApiError(
          409,
          "REVISION_CONFLICT",
          "เซตอัปเปลี่ยนแล้ว กรุณาโหลดใหม่",
        );
      const saved = (
        await c.query(
          "UPDATE rules SET risk_plan=$2,revision=revision+1,active=false,updated_at=now() WHERE id=$1 RETURNING *",
          [id, input.riskPlan],
        )
      ).rows[0];
      await c.query(
        "INSERT INTO rule_revisions(rule_id,revision,spec) VALUES($1,$2,$3)",
        [id, saved.revision, saved.spec],
      );
      return saved;
    });
  });
  app.get("/api/v1/signals/:id/outcome", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const row = (
      await db.query(
        "SELECT o.signal_id,o.risk_snapshot,o.result,o.finalized,s.revision,s.event FROM signal_outcomes o JOIN signals s ON s.id=o.signal_id JOIN rules r ON r.id=s.rule_id WHERE s.id=$1 AND s.owner_id=$2 AND ($3::uuid IS NULL OR r.workspace_id=$3)",
        [id, req.userId, req.workspaceId ?? null],
      )
    ).rows[0];
    if (!row) throw new ApiError(404, "NOT_FOUND", "ไม่พบผลสัญญาณ");
    return row;
  });
}
