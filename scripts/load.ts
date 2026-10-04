import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { localDatabase } from "./postgres.js";
import { database, migrate } from "../src/data/db.js";
import { buildApp, hash } from "../src/api.js";
const postgres = await localDatabase(),
  db = database(postgres.url);
await migrate(db);
const { app } = await buildApp(db, { local: true });
const users = Array.from({ length: 100 }, () => ({
    id: randomUUID(),
    token: randomUUID(),
  })),
  times: number[] = [];
try {
  for (const u of users) {
    await db.query("INSERT INTO users(id,email) VALUES($1,$2)", [
      u.id,
      u.id + "@load.invalid",
    ]);
    await db.query(
      "INSERT INTO sessions VALUES($1,$2,now()+interval '1 hour')",
      [hash(u.token), u.id],
    );
  }
  const start = performance.now();
  await Promise.all(
    users.map(async (u) => {
      const since = performance.now();
      for (const url of [
        "/api/v1/me",
        "/api/v1/rules",
        "/api/v1/conversations",
      ]) {
        const result = await app.inject({
          url,
          headers: {
            host: "127.0.0.1:4173",
            cookie: "snaap_session=" + u.token,
          },
        });
        assert.equal(result.statusCode, 200);
        if (url.endsWith("/me")) assert.equal(result.json().id, u.id);
        else assert.deepEqual(result.json(), []);
      }
      times.push(performance.now() - since);
    }),
  );
  times.sort((a, b) => a - b);
  console.log(
    JSON.stringify({
      scenario:
        "100 concurrent isolated users, 3 authenticated reads each; excludes AI and market load",
      requests: 300,
      elapsedMs: Math.round(performance.now() - start),
      userP95Ms: Math.round(times[94]),
      failures: 0,
    }),
  );
} finally {
  await app.close();
  await db.query("DELETE FROM sessions WHERE user_id=ANY($1::uuid[])", [
    users.map((u) => u.id),
  ]);
  await db.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [
    users.map((u) => u.id),
  ]);
  await db.end();
  await postgres.stop();
}
