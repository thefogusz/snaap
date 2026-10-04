import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { localDatabase } from "./postgres.js";
import { database } from "../src/data/db.js";
const pg = await localDatabase(),
  db = database(pg.url);
try {
  const rows = (
    await db.query(
      "SELECT r.revision,r.active,r.spec FROM rules r JOIN workspaces w ON w.id=r.workspace_id WHERE r.owner_id='00000000-0000-4000-8000-000000000001' AND w.name='Audit Harness 2026-10-04' ORDER BY r.revision DESC",
    )
  ).rows;
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => !r.active));
  assert.equal(rows[0].revision, 2);
  assert.equal(rows[0].spec.cooldownBars, 7);
  assert.equal(rows[1].revision, 1);
  assert.equal(rows[1].spec.cooldownBars, 5);
  const expected = structuredClone(rows[1].spec);
  expected.cooldownBars = 7;
  assert.deepEqual(rows[0].spec, expected);
  await writeFile(
    ".local/audit/ui-results.json",
    JSON.stringify(
      {
        savedRules: rows.length,
        allPaused: true,
        editedRevision: 2,
        cooldown: 7,
        onlyCooldownChanged: true,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS UI saved setup chat edit updates existing revision, only cooldown changes, no duplicate, both fixtures paused",
  );
} finally {
  await db.end();
  await pg.stop();
}
