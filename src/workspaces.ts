import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ApiError } from "./errors.js";
import { transaction } from "./data/db.js";
import { userLimits } from './usage-policy.js';
export const scopeTables = {
  image: "assets",
  import: "imports",
  connection: "exchange_connections",
} as const;
export function registerWorkspaces(app: FastifyInstance, db: pg.Pool) {
  app.get("/api/v1/workspaces", async (req) =>
    transaction(db, async (c) => {
      await c.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
        req.userId,
      ]);
      let rows = (
        await c.query(
          "SELECT id,name,is_default FROM workspaces WHERE owner_id=$1 ORDER BY created_at",
          [req.userId],
        )
      ).rows;
      if (!rows.some((r) => r.is_default)) {
        const id = randomUUID();
        await c.query(
          "INSERT INTO workspaces(id,owner_id,name,is_default) VALUES($1,$2,'พื้นที่หลัก',true)",
          [id, req.userId],
        );
        rows.unshift({ id, name: "พื้นที่หลัก", is_default: true });
      }
      const defaultId = rows.find((r) => r.is_default).id;
      for (const table of ["rules", "conversations"])
        await c.query(
          `UPDATE ${table} SET workspace_id=$1 WHERE owner_id=$2 AND workspace_id IS NULL`,
          [defaultId, req.userId],
        );
      return rows;
    }),
  );
  app.post("/api/v1/workspaces", async (req, reply) => {
    const { name } = z
      .object({ name: z.string().trim().min(1).max(60) })
      .strict()
      .parse(req.body);
    return transaction(db, async (c) => {
      await c.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
        req.userId,
      ]);
      const { workspaces: workspaceLimit } = await userLimits(c, req.userId);
      const workspaces = (await c.query('SELECT count(*)::int AS n,bool_or(is_default) AS has_default FROM workspaces WHERE owner_id=$1', [req.userId])).rows[0];
      // Reserve a slot for the primary workspace even before its first lazy creation.
      const used = Number(workspaces.n) + (workspaces.has_default ? 0 : 1);
      if (workspaceLimit !== null && used >= workspaceLimit)
        throw new ApiError(409, 'WORKSPACE_LIMIT', `สร้างเวิร์กสเปซได้สูงสุด ${workspaceLimit} พื้นที่ รวมพื้นที่หลัก`);
      const id = randomUUID();
      await c.query(
        "INSERT INTO workspaces(id,owner_id,name) VALUES($1,$2,$3)",
        [id, req.userId, name],
      );
      return reply.code(201).send({ id, name, is_default: false });
    });
  });
  app.put("/api/v1/workspaces/:id", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { name } = z
      .object({ name: z.string().trim().min(1).max(60) })
      .strict()
      .parse(req.body);
    const result = await db.query(
      "UPDATE workspaces SET name=$1 WHERE id=$2 AND owner_id=$3 RETURNING id,name,is_default",
      [name, id, req.userId],
    );
    if (!result.rowCount)
      throw new ApiError(404, "NOT_FOUND", "ไม่พบเวิร์กสเปซ");
    return result.rows[0];
  });
  app.delete("/api/v1/workspaces/:id", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    return transaction(db, async (c) => {
      await c.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
        req.userId,
      ]);
      const space = (
        await c.query(
          "SELECT id,is_default FROM workspaces WHERE id=$1 AND owner_id=$2 FOR UPDATE",
          [id, req.userId],
        )
      ).rows[0];
      if (!space) throw new ApiError(404, "NOT_FOUND", "ไม่พบเวิร์กสเปซ");
      if (space.is_default)
        throw new ApiError(409, "DEFAULT_WORKSPACE", "ลบพื้นที่หลักไม่ได้");
      const primary = (
        await c.query(
          "SELECT id FROM workspaces WHERE owner_id=$1 AND is_default FOR UPDATE",
          [req.userId],
        )
      ).rows[0];
      if (!primary)
        throw new ApiError(
          409,
          "DEFAULT_WORKSPACE_MISSING",
          "ไม่พบพื้นที่หลัก กรุณาโหลดหน้าใหม่",
        );
      for (const table of ["rules", "conversations"])
        await c.query(
          `UPDATE ${table} SET workspace_id=$1 WHERE owner_id=$2 AND workspace_id=$3`,
          [primary.id, req.userId, id],
        );
      await c.query(
        "UPDATE data_scopes SET workspace_ids=ARRAY(SELECT DISTINCT x FROM unnest(array_replace(workspace_ids,$1::uuid,$2::uuid)) x) WHERE owner_id=$3 AND $1::uuid=ANY(workspace_ids)",
        [id, primary.id, req.userId],
      );
      await c.query("DELETE FROM workspaces WHERE id=$1 AND owner_id=$2", [
        id,
        req.userId,
      ]);
      return { workspaceId: primary.id };
    });
  });
  app.get("/api/v1/data-scopes", async (req) => {
    const results = [];
    for (const [kind, table] of Object.entries(scopeTables))
      results.push(
        ...(
          await db.query(
            `SELECT r.id,r.name,$2::text AS kind,s.workspace_ids FROM ${table} r LEFT JOIN data_scopes s ON s.resource_id=r.id AND s.kind=$2 AND s.owner_id=r.owner_id WHERE r.owner_id=$1 ORDER BY r.name,r.id`,
            [req.userId, kind],
          )
        ).rows,
      );
    return results;
  });
  app.put("/api/v1/data-scopes/:kind/:id", async (req) => {
    const { kind, id } = z
      .object({
        kind: z.enum(["image", "import", "connection"]),
        id: z.string().uuid(),
      })
      .parse(req.params);
    const { workspaceIds } = z
      .object({
        workspaceIds: z.array(z.string().uuid()).min(1).max(100).nullable(),
      })
      .strict()
      .parse(req.body);
    return transaction(db, async (c) => {
      const row = await c.query(
        `SELECT id FROM ${scopeTables[kind]} WHERE id=$1 AND owner_id=$2 FOR UPDATE`,
        [id, req.userId],
      );
      if (!row.rowCount) throw new ApiError(404, "NOT_FOUND", "ไม่พบข้อมูล");
      if (
        workspaceIds &&
        (
          await c.query(
            "SELECT id FROM workspaces WHERE owner_id=$1 AND id=ANY($2::uuid[])",
            [req.userId, [...new Set(workspaceIds)]],
          )
        ).rowCount !== new Set(workspaceIds).size
      )
        throw new ApiError(
          403,
          "WORKSPACE_FORBIDDEN",
          "เลือกได้เฉพาะเวิร์กสเปซของคุณ",
        );
      await c.query(
        "INSERT INTO data_scopes(owner_id,kind,resource_id,workspace_ids) VALUES($1,$2,$3,$4) ON CONFLICT(owner_id,kind,resource_id) DO UPDATE SET workspace_ids=EXCLUDED.workspace_ids",
        [req.userId, kind, id, workspaceIds],
      );
      if (kind === "connection")
        await c.query(
          "INSERT INTO data_scopes(owner_id,kind,resource_id,workspace_ids) SELECT owner_id,'import',id,$3::uuid[] FROM imports WHERE owner_id=$1 AND account_scope=$2 ON CONFLICT(owner_id,kind,resource_id) DO UPDATE SET workspace_ids=EXCLUDED.workspace_ids",
          [req.userId, id, workspaceIds],
        );
      return { workspaceIds };
    });
  });
}
