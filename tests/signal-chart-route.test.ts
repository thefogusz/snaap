import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import { registerSignalCharts, chartToken } from "../src/signal-chart.js";
import { demoSignal } from "../src/notification-format.js";
test("signed chart endpoints serve snapshot or demo, reject altered tokens before database access", async () => {
  const before = process.env.DATA_ENCRYPTION_KEY;
  process.env.DATA_ENCRYPTION_KEY = "a".repeat(64);
  const app = Fastify();
  let reads = 0;
  registerSignalCharts(app, {
    query: async () => {
      reads++;
      return { rows: [demoSignal()] };
    },
  } as any);
  try {
    const id = randomUUID();
    const path = `/signal-charts/${id}/lime/`;
    assert.equal(
      (await app.inject(path + "b".repeat(64) + ".png")).statusCode,
      404,
    );
    assert.equal(reads, 0);
    const response = await app.inject(path + chartToken(id, "lime") + ".png");
    assert.equal(response.statusCode, 200);
    assert.match(response.headers["content-type"]!, /image\/png/);
    assert.equal(reads, 1);
    const demo = "demo-" + Date.now();
    assert.equal(
      (
        await app.inject(
          `/signal-charts/${demo}/cyan/${chartToken(demo, "cyan")}.png`,
        )
      ).statusCode,
      200,
    );
    assert.equal(reads, 1);
  } finally {
    await app.close();
    if (before === undefined) delete process.env.DATA_ENCRYPTION_KEY;
    else process.env.DATA_ENCRYPTION_KEY = before;
  }
});
