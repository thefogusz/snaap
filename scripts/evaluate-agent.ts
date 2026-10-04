import { readFile, writeFile, copyFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import sharp from "sharp";
import { localDatabase } from "./postgres.js";
import { database, migrate } from "../src/data/db.js";
import { buildApp, hash } from "../src/api.js";
if (!process.env.AI_API_KEY || process.env.RUN_PAID_EVALS !== "true")
  throw new Error(
    "Configure AI_API_KEY, per-model costs and RUN_PAID_EVALS=true before paid evaluation.",
  );
const cases = JSON.parse(
  await readFile(".local/evals/cases.json", "utf8"),
).cases;
const postgres = await localDatabase(),
  db = database(postgres.url);
await migrate(db);
const { app } = await buildApp(db, { local: true });
const owner = randomUUID(),
  token = randomUUID(),
  headers = {
    host: "127.0.0.1:4173",
    "x-snaap-client": "web",
    cookie: "snaap_session=" + token,
  };
const results = [];
try {
  await db.query("INSERT INTO users(id,email) VALUES($1,$2)", [
    owner,
    "eval-" + owner + "@snaap.invalid",
  ]);
  await db.query("INSERT INTO sessions VALUES($1,$2,now()+interval '1 day')", [
    hash(token),
    owner,
  ]);
  await db.query(
    "INSERT INTO entitlements(owner_id,pro_until) VALUES($1,now()+interval '1 day')",
    [owner],
  );
  for (const item of cases) {
    const conversation = (
      await app.inject({
        url: "/api/v1/conversations",
        method: "POST",
        headers,
        payload: { title: "Evaluation " + item.id },
      })
    ).json();
    const imageIds = [];
    if (item.image) {
      const id = randomUUID(),
        file = path.resolve(".local/assets", id + ".webp");
      await sharp(await readFile(item.image))
        .webp()
        .toFile(file);
      const metadata = await sharp(file).metadata();
      await db.query(
        "INSERT INTO assets(id,owner_id,name,mime,storage_path,metadata) VALUES($1,$2,$3,$4,$5,$6)",
        [
          id,
          owner,
          "evaluation",
          "image/webp",
          file,
          { width: metadata.width, height: metadata.height },
        ],
      );
      imageIds.push(id);
    }
    const response = await app.inject({
      url: `/api/v1/conversations/${conversation.id}/turns`,
      method: "POST",
      headers,
      payload: {
        text: item.prompt,
        mode: "standard",
        selection: { ruleIds: [], importIds: [] },
        imageIds,
      },
    });
    results.push({
      id: item.id,
      expectation: item.expectation,
      status: response.statusCode,
      result: response.json(),
      humanReview: "PENDING",
    });
    await writeFile(
      ".local/evals/results.json",
      JSON.stringify(
        {
          owner,
          cases: results,
          passed: false,
          reason: "Human semantic review required",
        },
        null,
        2,
      ),
    );
    console.log("Case", item.id, response.statusCode);
  }
} finally {
  await app.close();
  await db.end();
  await postgres.stop();
}
// Evaluation records are kept under an isolated account for review; no real user history is used.
