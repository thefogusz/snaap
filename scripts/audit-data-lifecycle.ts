import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
import pg from "pg";
import sharp from "sharp";
import Fastify from "fastify";
import { registerPresets } from "../src/presets.js";
import { migrate } from "../src/data/db.js";
import { buildApp, hash } from "../src/api.js";
const password = (await readFile(".local/database-password", "utf8")).trim();
const admin = new pg.Pool({
  connectionString: `postgresql://snaap:${encodeURIComponent(password)}@127.0.0.1:55432/snaap_utf8`,
});
const schema = "audit_data_" + randomUUID().replaceAll("-", "");
await admin.query(`CREATE SCHEMA ${schema}`);
const db = new pg.Pool({
  connectionString: `postgresql://snaap:${encodeURIComponent(password)}@127.0.0.1:55432/snaap_utf8`,
  options: `-c search_path=${schema}`,
  max: 8,
});
let app: Awaited<ReturnType<typeof buildApp>>["app"] | undefined;
const files: string[] = [];
const counts = {
  personas: 10,
  simulatedDays: 10,
  conversations: 0,
  savedSetups: 0,
  deepBlocked: 0,
  invalidSetups: 0,
  imageUploads: 0,
  imageLimitBlocked: 0,
  checks: 0,
};
const bugs: string[] = [];
const check = (actual: unknown, expected: unknown) => {
  assert.deepEqual(actual, expected);
  counts.checks++;
};
const condition = {
  kind: "COMPARE",
  op: ">",
  left: { kind: "PRICE", field: "close", timeframe: "5m" },
  right: { kind: "CONSTANT", value: 100 },
};
const spec = {
  schemaVersion: 2,
  name: "Audit setup",
  exchange: ["MEXC"],
  market: "Spot",
  pairs: ["BTC/USDT"],
  timeframe: "5m",
  entry: condition,
  stages: [],
  cooldownBars: 0,
  destinations: [],
};
try {
  await migrate(db);
  app = (await buildApp(db, { validateMarket: async () => {} })).app;
  const personas = await Promise.all(
    Array.from({ length: 10 }, async () => {
      const id = randomUUID(),
        workspace = randomUUID(),
        otherWorkspace = randomUUID(),
        token = randomUUID();
      await db.query("INSERT INTO users(id) VALUES($1)", [id]);
      await db.query(
        "INSERT INTO sessions VALUES($1,$2,now()+interval '1 day')",
        [hash(token), id],
      );
      await db.query(
        "INSERT INTO workspaces(id,owner_id,name,is_default) VALUES($1,$3,'audit',true),($2,$3,'other',false)",
        [workspace, otherWorkspace, id],
      );
      return {
        id,
        workspace,
        otherWorkspace,
        headers: {
          host: "127.0.0.1:4173",
          cookie: `snaap_session=${token}`,
          "x-snaap-client": "web",
          "x-snaap-workspace": workspace,
        },
      };
    }),
  );
  await Promise.all(
    personas.map(async (persona, index) => {
      for (let day = 0; day < 10; day++) {
        const created = await app!.inject({
          method: "POST",
          url: "/api/v1/conversations",
          headers: persona.headers,
          payload: { title: `persona ${index} day ${day}: analyze only` },
        });
        check(created.statusCode, 201);
        const id = created.json().id;
        counts.conversations++;
        const blocked = await app!.inject({
          method: "POST",
          url: `/api/v1/conversations/${id}/turns`,
          headers: persona.headers,
          payload: { text: "ช่วยวิเคราะห์", mode: "deep" },
        });
        check(blocked.statusCode, 503);
        check(blocked.json().error.code, "AI_DEEP_UNAVAILABLE");
        counts.deepBlocked++;
        const draft = await app!.inject({
          method: "PUT",
          url: `/api/v1/conversations/${id}/draft`,
          headers: persona.headers,
          payload: { spec, expectedRevision: 0 },
        });
        check(draft.statusCode, 200);
        let row = (
          await db.query(
            "SELECT setup_saved_at,setup_status_known FROM conversations WHERE id=$1",
            [id],
          )
        ).rows[0];
        check(row.setup_saved_at, null);
        check(row.setup_status_known, true);
        const invalid = await app!.inject({
          method: "POST",
          url: "/api/v1/rules",
          headers: persona.headers,
          payload: {
            conversationId: id,
            spec: {
              ...spec,
              entry: {
                kind: "GROUP",
                op: "AND",
                children: Array(7).fill(condition),
              },
            },
          },
        });
        check(invalid.statusCode, 400);
        counts.invalidSetups++;
        check(
          (
            await db.query(
              "SELECT setup_saved_at FROM conversations WHERE id=$1",
              [id],
            )
          ).rows[0].setup_saved_at,
          null,
        );
        if (day % 4 === 0) {
          const save = await app!.inject({
            method: "POST",
            url: "/api/v1/rules",
            headers: persona.headers,
            payload: { conversationId: id, spec },
          });
          check(save.statusCode, 201);
          counts.savedSetups++;
          check(
            Boolean(
              (
                await db.query(
                  "SELECT setup_saved_at FROM conversations WHERE id=$1",
                  [id],
                )
              ).rows[0].setup_saved_at,
            ),
            true,
          );
        }
      }
    }),
  );
  check(
    Number((await db.query("SELECT count(*) FROM usage_ledger")).rows[0].count),
    0,
  );
  const png = await sharp({
    create: { width: 12, height: 12, channels: 3, background: "#c4ef3d" },
  })
    .png()
    .toBuffer();
  const boundary = "audit-boundary";
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audit.png"\r\nContent-Type: image/png\r\n\r\n`,
    ),
    png,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const person = personas[0];
  const upload = () =>
    app!.inject({
      method: "POST",
      url: "/api/v1/images?purpose=library",
      headers: {
        ...person.headers,
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });
  const uploaded = await Promise.all(Array.from({ length: 6 }, upload));
  check(uploaded.filter((x) => x.statusCode === 201).length, 5);
  check(
    uploaded.filter(
      (x) =>
        x.statusCode === 400 && x.json().error.code === "IMAGE_LIBRARY_LIMIT",
    ).length,
    1,
  );
  counts.imageUploads = 5;
  counts.imageLimitBlocked = 1;
  check(
    (await db.query("SELECT name FROM assets ORDER BY name")).rows.map(
      (x) => x.name,
    ),
    ["1", "2", "3", "4", "5"],
  );
  files.push(
    ...(await db.query("SELECT storage_path FROM assets")).rows.map(
      (x) => x.storage_path,
    ),
  );
  const asset = uploaded.find((x) => x.statusCode === 201)!.json().id;
  await db.query(
    "INSERT INTO data_scopes(owner_id,kind,resource_id,workspace_ids) VALUES($1,'image',$2,$3)",
    [person.id, asset, [person.otherWorkspace]],
  );
  const invisible = await app.inject({
    url: `/api/v1/images/${asset}`,
    headers: person.headers,
  });
  check(invisible.statusCode, 404);
  const wrongOwner = await app.inject({
    method: "DELETE",
    url: `/api/v1/images/${asset}`,
    headers: personas[1].headers,
  });
  check(wrongOwner.statusCode, 200);
  check(
    (await db.query("SELECT count(*) FROM assets WHERE id=$1", [asset])).rows[0]
      .count,
    "1",
  );
  const invisibleDelete = await app.inject({
    method: "DELETE",
    url: `/api/v1/images/${asset}`,
    headers: person.headers,
  });
  check(invisibleDelete.statusCode, 200);
  check(
    (await db.query("SELECT id FROM assets WHERE id=$1", [asset])).rowCount,
    1,
  );
  const conversation = (
    await app.inject({
      method: "POST",
      url: "/api/v1/conversations",
      headers: person.headers,
      payload: { title: "image cleanup save" },
    })
  ).json().id;
  const temporary = await app.inject({
    method: "POST",
    url: `/api/v1/images?purpose=chat&conversationId=${conversation}`,
    headers: {
      ...person.headers,
      "content-type": `multipart/form-data; boundary=${boundary}`,
    },
    payload,
  });
  check(temporary.statusCode, 201);
  const temporaryId = temporary.json().id;
  const temporaryPath = (
    await db.query("SELECT storage_path FROM assets WHERE id=$1", [temporaryId])
  ).rows[0].storage_path;
  files.push(temporaryPath);
  await db.query(
    "INSERT INTO messages(id,conversation_id,role,content,sources) VALUES($1,$2,'user','image fixture',$3)",
    [
      randomUUID(),
      conversation,
      JSON.stringify([
        { id: temporaryId, type: "image" },
        { id: asset, type: "image" },
      ]),
    ],
  );
  const stale = await app.inject({
    method: "PUT",
    url: `/api/v1/rules/${randomUUID()}`,
    headers: person.headers,
    payload: { expectedRevision: 99, spec, conversationId: conversation },
  });
  check(stale.statusCode, 409);
  check(
    (
      await db.query("SELECT setup_saved_at FROM conversations WHERE id=$1", [
        conversation,
      ])
    ).rows[0].setup_saved_at,
    null,
  );
  const saved = await app.inject({
    method: "POST",
    url: "/api/v1/rules",
    headers: person.headers,
    payload: { spec, conversationId: conversation },
  });
  check(saved.statusCode, 201);
  check(
    (await db.query("SELECT count(*) FROM assets WHERE purpose='chat'")).rows[0]
      .count,
    "0",
  );
  check(
    (await db.query("SELECT count(*) FROM assets WHERE purpose='library'"))
      .rows[0].count,
    "5",
  );
  check(
    (
      await db.query("SELECT sources FROM messages WHERE conversation_id=$1", [
        conversation,
      ])
    ).rows[0].sources,
    [{ id: asset, type: "image" }],
  );
  await assert.rejects(
    () => readFile(temporaryPath),
    (error: any) => error.code === "ENOENT",
  );
  counts.checks++;
  const presetApp = Fastify();
  presetApp.addHook("onRequest", async (req) => {
    req.userId = person.id;
    req.workspaceId = person.workspace;
  });
  registerPresets(presetApp, db, {
    instruments: async () => ({
      at: Date.now(),
      items: [{ symbol: "BTC/USDT", supported: true }],
    }),
  });
  try {
    const presetConversation = randomUUID(),
      presetMessage = randomUUID();
    await db.query(
      "INSERT INTO conversations(id,owner_id,title,workspace_id,draft,draft_revision) VALUES($1,$2,$3,$4,$5,1)",
      [
        presetConversation,
        person.id,
        "preset save fixture",
        person.workspace,
        spec,
      ],
    );
    await db.query(
      "INSERT INTO messages(id,conversation_id,role,content,ui_card) VALUES($1,$2,'assistant','preset fixture',$3)",
      [
        presetMessage,
        presetConversation,
        JSON.stringify({
          type: "preset",
          presetId: "trend",
          spec,
          ruleId: null,
        }),
      ],
    );
    const presetConflict = await presetApp.inject({
      method: "POST",
      url: `/api/v1/conversations/${presetConversation}/preset/${presetMessage}/save`,
      payload: { expectedRevision: 0, destinations: [] },
    });
    check(presetConflict.statusCode, 409);
    check(
      (
        await db.query("SELECT setup_saved_at FROM conversations WHERE id=$1", [
          presetConversation,
        ])
      ).rows[0].setup_saved_at,
      null,
    );
    const presetSave = await presetApp.inject({
      method: "POST",
      url: `/api/v1/conversations/${presetConversation}/preset/${presetMessage}/save`,
      payload: { expectedRevision: 1, destinations: [] },
    });
    check(presetSave.statusCode, 200);
    check(
      Boolean(
        (
          await db.query(
            "SELECT setup_saved_at FROM conversations WHERE id=$1",
            [presetConversation],
          )
        ).rows[0].setup_saved_at,
      ),
      true,
    );
    const repeat = await presetApp.inject({
      method: "POST",
      url: `/api/v1/conversations/${presetConversation}/preset/${presetMessage}/save`,
      payload: { expectedRevision: 2, destinations: [] },
    });
    check(repeat.statusCode, 200);
    check(repeat.json().rule.id, presetSave.json().rule.id);
    check(
      (
        await db.query("SELECT count(*) FROM rule_revisions WHERE rule_id=$1", [
          repeat.json().rule.id,
        ])
      ).rows[0].count,
      "1",
    );
  } finally {
    await presetApp.close();
  }
  console.log(
    JSON.stringify(
      { schemaIsolation: true, noExternalCalls: true, counts, bugs },
      null,
      2,
    ),
  );
} finally {
  if (app) await app.close();
  for (const file of files) await unlink(file).catch(() => {});
  await db.end();
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
}
