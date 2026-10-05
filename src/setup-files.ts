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
      for (const [index, spec] of file.setups.entries()) {
        const id = randomUUID();
        await c.query(
          "INSERT INTO rules(id,owner_id,spec,workspace_id,active,risk_plan) VALUES($1,$2,$3,$4,false,$5)",
          [
            id,
            req.userId,
            spec,
            req.workspaceId ?? null,
            file.riskPlans?.[index] ?? null,
          ],
        );
        await c.query(
          "INSERT INTO rule_revisions(rule_id,revision,spec) VALUES($1,1,$2)",
          [id, spec],
        );
        items.push({
          id,
          spec,
          revision: 1,
          active: false,
          risk_plan: file.riskPlans?.[index] ?? null,
        });
      }
      return items;
    });
    return reply.code(201).send({ items });
  });
}
