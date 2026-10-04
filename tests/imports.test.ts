import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeTrades } from "../src/domain/imports.js";
test("deduplication preserves anonymous identical fills and different instrument IDs", () => {
  const row = { exchange: "Binance", pair: "BTC/USDT", id: "1" };
  const r = mergeTrades(
    [row],
    [
      row,
      { ...row, pair: "ETH/USDT" },
      { ...row, id: undefined },
      { ...row, id: undefined },
    ],
  );
  assert.equal(r.duplicates, 1);
  assert.equal(r.ambiguous, 2);
  assert.equal(r.rows.length, 3);
});
