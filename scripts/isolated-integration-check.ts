// Keep integration rules/checkpoints invisible to a concurrently running local monitor.
import pg from "pg";
import assert from "node:assert/strict";
import { localDatabase } from "./postgres.js";
import { database, migrate } from "../src/data/db.js";
const allowed = [
  "integration",
  "trade-sides-integration",
  "workspace-delete-integration",
  "setup-files-integration",
  "history-integration",
];
const selected = process.argv.slice(2);
if (!selected.length || selected.some((name) => !allowed.includes(name)))
  throw new Error(
    "Select supported integration scripts: " + allowed.join(", "),
  );
const postgres = await localDatabase(),
  admin = database(postgres.url);
const defaults = pg.defaults as typeof pg.defaults & { options?: string };
const originalOptions = defaults.options;
try {
  for (const name of selected) {
    const schema = "isolated_" + name.replaceAll("-", "_") + "_" + Date.now();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    defaults.options = "-c search_path=" + schema;
    try {
      const fixtureDb = database(postgres.url);
      try {
        assert.equal(
          (await fixtureDb.query("SELECT current_schema() AS name")).rows[0]
            .name,
          schema,
          "Integration must not run against public/live tables",
        );
        await migrate(fixtureDb);
      } finally {
        await fixtureDb.end();
      }
      await import("./" + name + ".js");
      console.log("PASS isolated", name);
    } finally {
      defaults.options = originalOptions;
      await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    }
  }
} finally {
  defaults.options = originalOptions;
  await admin.end();
  await postgres.stop();
}
