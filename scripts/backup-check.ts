import { randomUUID } from "node:crypto";
import { mkdir, copyFile, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { localDatabase } from "./postgres.js";
import { migrate, database } from "../src/data/db.js";
const postgres = await localDatabase(),
  db = database(postgres.url);
const dir = path.resolve(
  ".local/backups",
  new Date().toISOString().replace(/[:.]/g, "-"),
);
await mkdir(path.join(dir, "assets"), { recursive: true });
const tables = [
  "users",
  "sessions",
  "workspaces",
  "setup_shares",
  "data_scopes",
  "rules",
  "rule_revisions",
  "conversations",
  "messages",
  "entitlements",
  "usage_ledger",
  "assets",
  "imports",
  "destinations",
  "signals",
  "deliveries",
  "billing_events",
  "billing_grants",
  "billing_refunds",
  "agent_runs",
  "monitor_checkpoints",
  "monitor_status",
  "replay_runs",
  "exchange_connections",
];
const restored = "snaap_restore_" + randomUUID().replaceAll("-", "");
let created = false;
try {
  const snapshot: Record<string, unknown[]> = {};
  const c = await db.connect();
  try {
    await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    for (const table of tables)
      snapshot[table] = (await c.query(`SELECT * FROM ${table}`)).rows;
    for (const asset of snapshot.assets as any[]) {
      const source = path.resolve(asset.storage_path),
        root = path.resolve(".local/assets") + path.sep;
      if (!source.startsWith(root))
        throw new Error("ASSET_PATH_OUTSIDE_STORAGE");
      await copyFile(source, path.join(dir, "assets", asset.id + ".webp"));
    }
    await c.query("COMMIT");
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  } finally {
    c.release();
  }
  await writeFile(
    path.join(dir, "application.json"),
    JSON.stringify(snapshot),
    { mode: 0o600 },
  );
  await db.query(
    `CREATE DATABASE "${restored}" WITH TEMPLATE template0 ENCODING 'UTF8'`,
  );
  created = true;
  const target = new URL(postgres.url);
  target.pathname = "/" + restored;
  const copy = database(target.href);
  try {
    await migrate(copy);
    const saved = JSON.parse(
      await readFile(path.join(dir, "application.json"), "utf8"),
    );
    for (const table of tables) {
      if (saved[table].length)
        await copy.query(
          `INSERT INTO ${table} SELECT * FROM json_populate_recordset(NULL::${table},$1)`,
          [JSON.stringify(saved[table])],
        );
      const count = (
        await copy.query(`SELECT count(*)::int AS n FROM ${table}`)
      ).rows[0].n;
      if (count !== snapshot[table].length)
        throw new Error("RESTORE_COUNT_MISMATCH " + table);
    }
  } finally {
    await copy.end();
  }
  await writeFile(
    path.join(dir, "manifest.json"),
    JSON.stringify(
      {
        format: "snaap-application-v1",
        createdAt: new Date().toISOString(),
        restoreVerified: true,
        tables,
        includes: ["Application records", "Private image files"],
        excludes: [
          "PostgreSQL roles and settings",
          "pg-boss jobs regenerated from app outbox",
          "DATA_ENCRYPTION_KEY; keep separately",
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: application backup restored into isolated PostgreSQL database; all table counts match. " +
      dir,
  );
} finally {
  if (created && /^snaap_restore_[a-f0-9]{32}$/.test(restored)) {
    const cleanup = new URL(postgres.url);
    cleanup.pathname = "/postgres";
    const admin = database(cleanup.href);
    try {
      await admin.query(`DROP DATABASE "${restored}"`);
    } finally {
      await admin.end();
    }
  }
  await db.end();
  await postgres.stop();
}
