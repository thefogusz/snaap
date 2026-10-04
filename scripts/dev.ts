import { localDatabase } from "./postgres.js";
import { database, migrate } from "../src/data/db.js";
import { buildApp } from "../src/api.js";
import { startMonitor } from "../src/monitor.js";
import { localEncryptionKey } from "./local-secrets.js";
process.env.DATA_ENCRYPTION_KEY = await localEncryptionKey();
const postgres = await localDatabase();
const db = database(postgres.url);
await migrate(db);
const boss = await startMonitor(db, postgres.url);
const { app } = await buildApp(db, {
  local: true,
  developerPro: true,
  monitoring: true,
});
await app.listen({ host: "127.0.0.1", port: 4173 });
console.log("SNAAP local backend: http://127.0.0.1:4173");
for (const event of ["SIGINT", "SIGTERM"] as const)
  process.once(event, async () => {
    await app.close();
    await boss.stop();
    await db.end();
    await postgres.stop();
    process.exit(0);
  });
