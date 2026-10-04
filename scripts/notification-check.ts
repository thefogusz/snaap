import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { localDatabase } from "./postgres.js";
import { database, migrate, transaction } from "../src/data/db.js";
import { buildApp, hash } from "../src/api.js";
import { bindRecipient } from "../src/telegram-polling.js";
import { reserveLine, lineMonth } from "../src/line-quota.js";

// Uses isolated accounts; makes no provider calls and does not load .env.
const postgres = await localDatabase(),
  db = database(postgres.url);
await migrate(db);
const { app } = await buildApp(db);
const owner = randomUUID(),
  other = randomUUID(),
  token = randomUUID(),
  outsiderToken = randomUUID(),
  destination = randomUUID(),
  code = "b".repeat(48);
const beforeUser = process.env.LINE_MONTHLY_USER_LIMIT,
  beforeTotal = process.env.LINE_MONTHLY_TOTAL_LIMIT;
try {
  await db.query("INSERT INTO users(id) VALUES($1),($2)", [owner, other]);
  await db.query(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour'),($3,$4,now()+interval '1 hour')",
    [hash(token), owner, hash(outsiderToken), other],
  );
  await db.query(
    "INSERT INTO destinations(id,owner_id,kind,name,config) VALUES($1,$2,$3,$4,$5)",
    [
      destination,
      owner,
      "TELEGRAM",
      "Notification QA",
      { challengeHash: hash(code), expiresAt: Date.now() + 60000 },
    ],
  );
  const headers = {
    host: "127.0.0.1:4173",
    "x-snaap-client": "web",
    cookie: "snaap_session=" + token,
  };
  const outsider = { ...headers, cookie: "snaap_session=" + outsiderToken };
  await bindRecipient(db, "TELEGRAM", "/start " + code, "first-user");
  await bindRecipient(db, "TELEGRAM", "/start " + code, "second-user");
  assert.equal(
    (
      await db.query("SELECT config FROM destinations WHERE id=$1", [
        destination,
      ])
    ).rows[0].config.recipient,
    "first-user",
  );
  const patch = {
    method: "PATCH" as const,
    url: "/api/v1/destinations/" + destination,
    headers,
    payload: {
      name: "Edited",
      appearance: { layout: "minimal", language: "en" },
    },
  };
  assert.equal(
    (await app.inject({ ...patch, headers: outsider })).statusCode,
    404,
  );
  assert.equal((await app.inject(patch)).statusCode, 200);
  assert.equal(
    (
      await app.inject({
        ...patch,
        payload: { name: "bad", appearance: { botToken: "reject" } },
      })
    ).statusCode,
    400,
  );
  const list = (
    await app.inject({ url: "/api/v1/destinations", headers })
  ).json();
  assert.equal(list.items[0].appearance.language, "en");
  assert.equal(list.items[0].config, undefined);
  await app.inject({
    method: "DELETE",
    url: "/api/v1/destinations/" + destination,
    headers,
  });
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/v1/destinations/" + destination + "/test",
        headers,
        payload: {},
      })
    ).statusCode,
    409,
  );
  await db.query("UPDATE destinations SET config=$2 WHERE id=$1", [
    destination,
    { challengeHash: hash(code), expiresAt: Date.now() + 60000 },
  ]);
  await app.inject({
    method: "DELETE",
    url: "/api/v1/destinations/" + destination,
    headers,
  });
  await bindRecipient(db, "TELEGRAM", "/start " + code, "late-user");
  assert.equal(
    (
      await db.query("SELECT verified FROM destinations WHERE id=$1", [
        destination,
      ])
    ).rows[0].verified,
    false,
  );
  process.env.LINE_MONTHLY_USER_LIMIT = "2";
  process.env.LINE_MONTHLY_TOTAL_LIMIT = "10000000";
  const results = await Promise.all(
    Array.from({ length: 8 }, () =>
      transaction(db, (c) => reserveLine(c, owner, randomUUID())),
    ),
  );
  assert.equal(results.filter(Boolean).length, 2);
  const slot = (
    await db.query(
      "SELECT request_id FROM notification_quota WHERE owner_id=$1 AND month=$2",
      [owner, lineMonth()],
    )
  ).rows[0].request_id;
  assert.equal(await transaction(db, (c) => reserveLine(c, owner, slot)), true);
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::integer AS n FROM notification_quota WHERE owner_id=$1",
        [owner],
      )
    ).rows[0].n,
    2,
  );
  const total = (
    await db.query(
      "SELECT count(*)::integer AS n FROM notification_quota WHERE month=$1",
      [lineMonth()],
    )
  ).rows[0].n;
  process.env.LINE_MONTHLY_USER_LIMIT = "100";
  process.env.LINE_MONTHLY_TOTAL_LIMIT = String(total + 1);
  const sharedResults = await Promise.all(
    Array.from({ length: 8 }, () =>
      transaction(db, (c) => reserveLine(c, other, randomUUID())),
    ),
  );
  assert.equal(sharedResults.filter(Boolean).length, 1);
  process.env.LINE_MONTHLY_TOTAL_LIMIT = "0";
  assert.equal(
    await transaction(db, (c) => reserveLine(c, owner, slot)),
    false,
  );
  await db.query(
    "UPDATE destinations SET config=$2,verified=false WHERE id=$1",
    [destination, { challengeHash: hash(code), expiresAt: Date.now() - 1000 }],
  );
  await bindRecipient(db, "TELEGRAM", "/start " + code, "expired-user");
  assert.equal(
    (
      await db.query("SELECT verified FROM destinations WHERE id=$1", [
        destination,
      ])
    ).rows[0].verified,
    false,
  );
  console.log(
    "Notification integration passed: ownership, validation, persistence, one-time binding, disconnect, concurrent quota and retry dedup. No external messages sent.",
  );
} finally {
  await app.close();
  await db.query(
    "DELETE FROM notification_quota WHERE owner_id=ANY($1::uuid[])",
    [[owner, other]],
  );
  await db.query("DELETE FROM destinations WHERE owner_id=ANY($1::uuid[])", [
    [owner, other],
  ]);
  await db.query("DELETE FROM sessions WHERE user_id=ANY($1::uuid[])", [
    [owner, other],
  ]);
  await db.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [
    [owner, other],
  ]);
  await db.end();
  await postgres.stop();
  if (beforeUser === undefined) delete process.env.LINE_MONTHLY_USER_LIMIT;
  else process.env.LINE_MONTHLY_USER_LIMIT = beforeUser;
  if (beforeTotal === undefined) delete process.env.LINE_MONTHLY_TOTAL_LIMIT;
  else process.env.LINE_MONTHLY_TOTAL_LIMIT = beforeTotal;
}
