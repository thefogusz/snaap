import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import type pg from "pg";
import { registerRuleDestinations } from "../src/rule-destinations.js";
import { ZodError } from "zod";

const owner = "00000000-0000-4000-8000-000000000001";
const ruleId = "00000000-0000-4000-8000-000000000002";
const destination = "00000000-0000-4000-8000-000000000003";
async function fixture() {
  let row = { id: ruleId, owner_id: owner, workspace_id: null, active: true, activated_at: "2026-10-05T01:00:00Z", revision: 3,
    spec: { schemaVersion: 2, name: "Routing fixture", exchange: ["MEXC"], market: "Spot", side: "SPOT", pairs: ["BTC/USDT"], timeframe: "5m",
      entry: { kind: "COMPARE", op: ">", left: { kind: "PRICE", field: "close", timeframe: "5m" }, right: { kind: "CONSTANT", value: 100 } }, stages: [], cooldownBars: 0, destinations: [] as string[] } };
  const calls: Array<{ sql: string; values: any[] }> = [];
  const client = { release() {}, async query(sql: string, values: any[] = []) {
    calls.push({ sql, values });
    if (sql.startsWith("SELECT * FROM rules")) return { rows: values[1] === owner && values[2] === row.revision && values[3] === null ? [row] : [] };
    if (sql.startsWith("SELECT id FROM destinations")) return { rowCount: values[1].filter((id: string) => id === destination).length };
    if (sql.startsWith("UPDATE rules")) { row = { ...row, spec: values[0], revision: row.revision + 1 }; return { rows: [row] }; }
    return { rows: [], rowCount: 0 };
  } };
  const app = Fastify();
  app.decorateRequest("userId", "");
  app.addHook("preHandler", async req => {
    req.userId = String(req.headers["test-owner"] ?? owner);
    req.workspaceId = req.headers["test-workspace"] as string | undefined;
  });
  app.setErrorHandler((error, _req, reply) => reply.code(error instanceof ZodError ? 400 : (error as any).statusCode ?? 500).send({ error: "fixture" }));
  registerRuleDestinations(app, { connect: async () => client } as unknown as pg.Pool);
  return { app, calls, get row() { return row; }, async save(destinations: string[], expectedRevision = 3, headers = {}) {
    return app.inject({ method: "PUT", url: `/api/v1/rules/${ruleId}/destinations`, payload: { destinations, expectedRevision }, headers });
  } };
}
test("routing edits preserve activation, conditions and processed candle lifecycle", async () => {
  const f = await fixture();
  try {
    const before = structuredClone(f.row);
    const response = await f.save([destination]);
    assert.equal(response.statusCode, 200);
    const saved = response.json();
    assert.equal(saved.active, true);
    assert.equal(saved.activated_at, before.activated_at);
    assert.deepEqual(saved.spec, { ...before.spec, destinations: [destination] });
    assert.equal(saved.revision, 4);
    assert.deepEqual(f.calls.find(c => c.sql.startsWith("UPDATE monitor_checkpoints"))?.values, [ruleId, 4, 3]);
    assert.equal(f.calls.some(c => c.sql.startsWith("DELETE FROM monitor_checkpoints")), false);
    assert.equal((await f.save([], 4)).statusCode, 200);
    assert.equal(f.row.active, true);
    assert.deepEqual(f.row.spec.destinations, []);
  } finally { await f.app.close(); }
});
test("routing rejects foreign owners, stale revisions and another workspace", async () => {
  const f = await fixture();
  try {
    assert.equal((await f.save([destination], 3, { "test-owner": "outsider" })).statusCode, 409);
    assert.equal((await f.save([destination], 2)).statusCode, 409);
    assert.equal((await f.save([destination], 3, { "test-workspace": destination })).statusCode, 409);
    assert.equal(f.row.revision, 3);
    assert.equal(f.calls.some(c => c.sql.startsWith("UPDATE rules")), false);
  } finally { await f.app.close(); }
});
test("routing accepts only unique verified owned destinations and does not revise unchanged routing", async () => {
  const f = await fixture();
  try {
    assert.equal((await f.save([ruleId])).statusCode, 400);
    assert.equal((await f.save([destination, destination])).statusCode, 400);
    assert.equal((await f.save([])).statusCode, 200);
    assert.equal(f.row.revision, 3);
  } finally { await f.app.close(); }
});
