import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ApiError } from "./errors.js";
import { transaction } from "./data/db.js";
import { setupFile } from "./domain/setup-files.js";
import { makeSetupCode, setupCodeHash } from "./domain/setup-codes.js";
function sharedSetup(input: any) {
  return {
    setup: setupFile(input.spec ?? input).setups[0],
  };
}
function codeHash(params: unknown) {
  const { code } = z.object({ code: z.string().max(100) }).parse(params);
  try {
    return setupCodeHash(code);
  } catch {
    throw new ApiError(400, "INVALID_CODE", "โค้ดเซตอัปไม่ถูกต้อง");
  }
}
export function registerSetupShares(app: FastifyInstance, db: pg.Pool) {
  app.post("/api/v1/setup-shares", async (req, reply) => {
    const { ruleId } = z
      .object({ ruleId: z.string().uuid() })
      .strict()
      .parse(req.body);
    const row = (
      await db.query(
        "SELECT spec FROM rules WHERE deleted_at IS NULL AND id=$1 AND owner_id=$2 AND ($3::uuid IS NULL OR workspace_id=$3)",
        [ruleId, req.userId, req.workspaceId ?? null],
      )
    ).rows[0];
    if (!row) throw new ApiError(404, "NOT_FOUND", "ไม่พบเซตอัป");
    const setup = setupFile(row.spec).setups[0];
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = makeSetupCode();
      const result = await db.query(
        "INSERT INTO setup_shares(code_hash,owner_id,setup) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        [
          setupCodeHash(code),
          req.userId,
          setup,
        ],
      );
      if (result.rowCount) return reply.code(201).send({ code });
    }
    throw new ApiError(503, "RETRY", "สร้างโค้ดไม่สำเร็จ ลองอีกครั้ง");
  });
  app.get("/api/v1/setup-shares/:code", async (req) => {
    const row = (
      await db.query("SELECT setup FROM setup_shares WHERE code_hash=$1", [
        codeHash(req.params),
      ])
    ).rows[0];
    if (!row)
      throw new ApiError(
        404,
        "NOT_FOUND",
        "ไม่พบโค้ดนี้ หรือเจ้าของปิดการแชร์แล้ว",
      );
    return sharedSetup(row.setup);
  });
  app.post("/api/v1/setup-shares/:code/import", async (req, reply) => {
    z.object({})
      .strict()
      .parse(req.body ?? {});
    return transaction(db, async (c) => {
      const row = (
        await c.query(
          "SELECT setup FROM setup_shares WHERE code_hash=$1 FOR SHARE",
          [codeHash(req.params)],
        )
      ).rows[0];
      if (!row)
        throw new ApiError(
          404,
          "NOT_FOUND",
          "ไม่พบโค้ดนี้ หรือเจ้าของปิดการแชร์แล้ว",
        );
      const { setup: spec } = sharedSetup(row.setup),
        id = randomUUID();
      await c.query(
        "INSERT INTO rules(id,owner_id,spec,workspace_id,active) VALUES($1,$2,$3,$4,false)",
        [id, req.userId, spec, req.workspaceId ?? null],
      );
      await c.query(
        "INSERT INTO rule_revisions(rule_id,revision,spec) VALUES($1,1,$2)",
        [id, spec],
      );
      return reply
        .code(201)
        .send({ id, spec, revision: 1, active: false });
    });
  });
  app.delete("/api/v1/setup-shares/:code", async (req) => {
    const result = await db.query(
      "DELETE FROM setup_shares WHERE code_hash=$1 AND owner_id=$2",
      [codeHash(req.params), req.userId],
    );
    if (!result.rowCount)
      throw new ApiError(404, "NOT_FOUND", "ไม่พบโค้ดที่คุณแชร์");
    return { ok: true };
  });
}
