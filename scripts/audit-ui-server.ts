import pg from "pg";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { migrate } from "../src/data/db.js";
import { buildApp } from "../src/api.js";
const password = (await readFile(".local/database-password", "utf8")).trim();
const connectionString = `postgresql://snaap:${encodeURIComponent(password)}@127.0.0.1:55432/snaap_utf8`;
const schema =
  process.env.SNAAP_UI_AUDIT_SCHEMA ?? "audit_ui_20261004_" + Date.now();
if (!/^audit_ui_20261004_\d+$/.test(schema))
  throw new Error("Invalid isolated UI audit schema");
const admin = new pg.Pool({ connectionString });
await admin.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
const db = new pg.Pool({
  connectionString,
  options: `-c search_path=${schema}`,
  max: 8,
});
await migrate(db);
delete process.env.AI_API_KEY;
delete process.env.STRIPE_SECRET_KEY;
delete process.env.STRIPE_WEBHOOK_SECRET;
const { app } = await buildApp(db, {
  local: true,
  developerPro: true,
  monitoring: false,
  origin: "http://127.0.0.1:4175",
});
await mkdir(".local/audit", { recursive: true });
await writeFile(
  ".local/audit/ui-server.json",
  JSON.stringify({ schema, port: 4175, isolated: true }),
);
await app.listen({ host: "127.0.0.1", port: 4175 });
console.log("Isolated UX audit server ready: http://127.0.0.1:4175");
for (const event of ["SIGINT", "SIGTERM"] as const)
  process.once(event, async () => {
    await app.close();
    await db.end();
    await admin.end();
    process.exit(0);
  });
