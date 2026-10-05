import { test } from "node:test";
import assert from "node:assert/strict";
import { providerResult } from "../src/notification-send.js";
import { lineMonth, lineLimits } from "../src/line-quota.js";
test("provider acceptance requires Telegram message id and Discord id", () => {
  assert.equal(providerResult("TELEGRAM", 200, { ok: false }).status, "FAILED");
  assert.equal(
    providerResult("TELEGRAM", 200, { ok: true, result: { message_id: 4 } })
      .status,
    "SENT",
  );
  assert.equal(providerResult("DISCORD", 200, {}).status, "UNKNOWN");
  assert.equal(providerResult("DISCORD", 200, { id: "message" }).detail, "ผู้ให้บริการรับคำขอแล้ว");
});
test("LINE retry 409 is accepted only with accepted request id", () => {
  assert.equal(providerResult("LINE", 409, {}, "request-id").status, "SENT");
  assert.equal(providerResult("LINE", 409, {}).status, "FAILED");
  assert.equal(providerResult("LINE", 429, {}).status, "QUOTA_OR_RATE_LIMIT");
  assert.equal(providerResult("WEBHOOK", 503, {}).status, "RETRY");
});
test("LINE month uses Bangkok boundaries and free defaults stay bounded", () => {
  assert.equal(lineMonth(new Date("2026-09-30T17:00:00Z")), "2026-10");
  assert.equal(lineMonth(new Date("2026-09-30T16:59:59Z")), "2026-09");
  assert.ok(lineLimits().user >= 0);
});
