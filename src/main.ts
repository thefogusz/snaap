import { database, migrate } from "./data/db.js";
import { buildApp } from "./api.js";
import { startMonitor } from "./monitor.js";
if (!process.env.DATABASE_URL || !process.env.APP_ORIGIN)
  throw new Error("DATABASE_URL and APP_ORIGIN are required");
const db = database(process.env.DATABASE_URL);
await migrate(db);
const boss = await startMonitor(db, process.env.DATABASE_URL);
const { app } = await buildApp(db, {
  origin: process.env.APP_ORIGIN,
  monitoring: true,
});
await app.listen({
  host: process.env.BIND_HOST ?? "127.0.0.1",
  port: Number(process.env.PORT ?? 4173),
});
for (const event of ["SIGINT", "SIGTERM"] as const)
  process.once(event, async () => {
    await app.close();
    await boss.stop();
    await db.end();
    process.exit(0);
  });
