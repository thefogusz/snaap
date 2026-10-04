import { localDatabase } from "./postgres.js";
import { database } from "../src/data/db.js";
import { readFile } from "node:fs/promises";
const pg = await localDatabase();
const db = database(pg.url);
try {
  const audit = JSON.parse(
    await readFile(".local/audit/chat-results.json", "utf8"),
  );
  console.log(
    JSON.stringify(
      (
        await db.query(
          "SELECT r.status,r.trace FROM agent_runs r WHERE owner_id=$1 AND status='FAILED' ORDER BY r.created_at DESC LIMIT 2",
          [audit.owner],
        )
      ).rows,
      null,
      2,
    ),
  );
} finally {
  await db.end();
  await pg.stop();
}
