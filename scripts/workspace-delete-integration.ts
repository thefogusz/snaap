import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { localDatabase } from "./postgres.js";
import { database } from "../src/data/db.js";
import { buildApp, hash } from "../src/api.js";
const postgres = await localDatabase(),
  db = database(postgres.url),
  { app } = await buildApp(db, { local: true });
const owner = randomUUID(),
  other = randomUUID(),
  primary = randomUUID(),
  space = randomUUID(),
  foreign = randomUUID(),
  token = randomUUID(),
  rule = randomUUID(),
  conversation = randomUUID(),
  resource = randomUUID();
const base = { host: "127.0.0.1:4173", "x-snaap-client": "web" },
  headers = {
    ...base,
    cookie: `snaap_session=${token}`,
    "x-snaap-workspace": primary,
  };
try {
  await db.query("INSERT INTO users(id) VALUES($1),($2)", [owner, other]);
  await db.query("INSERT INTO sessions VALUES($1,$2,now()+interval '1 hour')", [
    hash(token),
    owner,
  ]);
  await db.query(
    "INSERT INTO workspaces(id,owner_id,name,is_default) VALUES($1,$2,'Main',true),($3,$2,'Delete',false),($4,$5,'Foreign',true)",
    [primary, owner, space, foreign, other],
  );
  await db.query(
    "INSERT INTO rules(id,owner_id,spec,revision,active,workspace_id) VALUES($1,$2,$3,1,true,$4)",
    [rule, owner, {}, space],
  );
  await db.query(
    "INSERT INTO conversations(id,owner_id,title,workspace_id) VALUES($1,$2,'Fixture',$3)",
    [conversation, owner, space],
  );
  await db.query(
    "INSERT INTO data_scopes(owner_id,kind,resource_id,workspace_ids) VALUES($1,'image',$2,$3)",
    [owner, resource, [primary, space]],
  );
  const request = (id: string) =>
    app.inject({ method: "DELETE", url: "/api/v1/workspaces/" + id, headers });
  assert.equal(
    (
      await app.inject({
        method: "DELETE",
        url: "/api/v1/workspaces/" + space,
        headers: base,
      })
    ).statusCode,
    401,
  );
  assert.equal((await request(foreign)).statusCode, 404);
  assert.equal((await request(primary)).statusCode, 409);
  const removed = await request(space);
  assert.equal(removed.statusCode, 200, removed.body);
  assert.equal(removed.json().workspaceId, primary);
  assert.equal(
    (await db.query("SELECT id FROM workspaces WHERE id=$1", [space])).rowCount,
    0,
  );
  const kept = (
    await db.query("SELECT workspace_id,active FROM rules WHERE id=$1", [rule])
  ).rows[0];
  assert.equal(kept.workspace_id, primary);
  assert.equal(kept.active, true);
  assert.equal(
    (
      await db.query("SELECT workspace_id FROM conversations WHERE id=$1", [
        conversation,
      ])
    ).rows[0].workspace_id,
    primary,
  );
  assert.deepEqual(
    (
      await db.query(
        "SELECT workspace_ids FROM data_scopes WHERE resource_id=$1",
        [resource],
      )
    ).rows[0].workspace_ids,
    [primary],
  );
  assert.equal((await request(space)).statusCode, 404);
  console.log(
    "Workspace deletion passed: ownership, main protected, contents moved intact, scopes deduplicated, repeat deletion rejected",
  );
} finally {
  await db.query("DELETE FROM data_scopes WHERE owner_id=$1", [owner]);
  await db.query("DELETE FROM conversations WHERE id=$1", [conversation]);
  await db.query("DELETE FROM rules WHERE id=$1", [rule]);
  await db.query("DELETE FROM sessions WHERE user_id=$1", [owner]);
  await db.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [
    [owner, other],
  ]);
  await app.close();
  await db.end();
  await postgres.stop();
}
