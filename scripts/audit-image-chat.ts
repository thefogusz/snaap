import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { localDatabase } from "./postgres.js";
import { database } from "../src/data/db.js";
import { buildApp, hash } from "../src/api.js";
const pg = await localDatabase(),
  db = database(pg.url),
  { app } = await buildApp(db, { local: true });
const owner = randomUUID(),
  token = randomUUID(),
  headers = {
    host: "127.0.0.1:4173",
    "x-snaap-client": "web",
    cookie: "snaap_session=" + token,
  };
try {
  await db.query("INSERT INTO users(id) VALUES($1)", [owner]);
  await db.query("INSERT INTO sessions VALUES($1,$2,now()+interval '1 day')", [
    hash(token),
    owner,
  ]);
  await db.query(
    "INSERT INTO entitlements(owner_id,pro_until) VALUES($1,now()+interval '1 day')",
    [owner],
  );
  const boundary = "audit-" + randomUUID(),
    bytes = await readFile(".local/audit/synthetic-chart.png");
  const upload = await app.inject({
    method: "POST",
    url: "/api/v1/images",
    headers: {
      ...headers,
      "content-type": "multipart/form-data; boundary=" + boundary,
    },
    payload: Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="synthetic-chart.png"\r\nContent-Type: image/png\r\n\r\n`,
      ),
      bytes,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
  });
  const image = upload.json();
  const conversation = (
    await app.inject({
      method: "POST",
      url: "/api/v1/conversations",
      headers,
      payload: { title: "Synthetic image audit" },
    })
  ).json();
  const response = await app.inject({
    method: "POST",
    url: `/api/v1/conversations/${conversation.id}/turns`,
    headers,
    payload: {
      text: "ภาพนี้เป็นกราฟจำลองสำหรับทดสอบ บอกเฉพาะสิ่งที่อ่านได้จากภาพและข้อมูลที่ขาด อย่าอ้างราคาหรือกำไรจริง ไม่ต้องสร้างเซตอัป",
      mode: "standard",
      selection: { ruleIds: [], importIds: [] },
      imageIds: [image.id],
    },
  });
  const trace = (
    await db.query(
      "SELECT trace FROM agent_runs WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 1",
      [owner],
    )
  ).rows[0]?.trace;
  await writeFile(
    ".local/audit/image-results.json",
    JSON.stringify(
      {
        uploadStatus: upload.statusCode,
        owner,
        response: response.json(),
        status: response.statusCode,
        trace,
      },
      null,
      2,
    ),
  );
  console.log(
    "upload",
    upload.statusCode,
    "chat",
    response.statusCode,
    response.json().error?.code ?? "response received",
  );
  const deleted = await app.inject({
    method: "DELETE",
    url: `/api/v1/images/${image.id}`,
    headers,
  });
  const unavailable = await app.inject({
    method: "POST",
    url: `/api/v1/conversations/${conversation.id}/turns`,
    headers,
    payload: { text: "อ่านภาพที่ลบไป", mode: "standard", imageIds: [image.id] },
  });
  console.log(
    "delete",
    deleted.statusCode,
    "reuse deleted image",
    unavailable.statusCode,
    unavailable.json().error?.code,
  );
} finally {
  await app.close();
  await db.end();
  await pg.stop();
}
