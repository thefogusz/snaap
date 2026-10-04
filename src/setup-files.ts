import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { transaction } from "./data/db.js";
import { setupFile } from "./domain/setup-files.js";
export function registerSetupFiles(app: FastifyInstance, db: pg.Pool) {
  app.post("/api/v1/setup-files/preview", async (req) => setupFile(req.body));
  app.post("/api/v1/setup-files/import", async (req, reply) => {
    const file = setupFile(req.body);
    const items = await transaction(db, async (c) => {
      const items = [];
      for (const spec of file.setups) {
        const id = randomUUID();
        await c.query(
          "INSERT INTO rules(id,owner_id,spec,workspace_id,active) VALUES($1,$2,$3,$4,false)",
          [id, req.userId, spec, req.workspaceId ?? null],
        );
        await c.query(
          "INSERT INTO rule_revisions(rule_id,revision,spec) VALUES($1,1,$2)",
          [id, spec],
        );
        items.push({ id, spec, revision: 1, active: false });
      }
      return items;
    });
    return reply.code(201).send({ items });
  });
}
