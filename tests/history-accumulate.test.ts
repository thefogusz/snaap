import { test } from "node:test";
import assert from "node:assert/strict";
import { accumulateImport } from "../src/history-auto.js";
import { mergeTrades } from "../src/domain/imports.js";

const trade = (id: string, day: number) => ({ id, exchange: "Binance", market: "Spot", pair: "BTC/USDT", time: new Date(Date.UTC(2026, 9, day)).toISOString() });

test("alternating manual and automatic syncs keep exactly one accumulated import", () => {
  type Row = { id: string; rows: ReturnType<typeof trade>[] };
  let imports: Row[] = [];
  const manual = (id: string, incoming: Row["rows"]) => {
    imports.push({ id, rows: mergeTrades(imports.flatMap((x) => x.rows), incoming).rows });
  };
  const auto = (incoming: Row["rows"]) => {
    const result = accumulateImport(imports, incoming);
    // created_at=now() moves the written row to the end of the ORDER BY created_at list.
    if (result.targetId) imports = [...imports.filter((x) => x.id !== result.targetId), { id: result.targetId, rows: result.rows }];
    else imports.push({ id: "auto", rows: result.rows });
    return result.targetId;
  };
  manual("m1", [trade("1", 1), trade("2", 2)]);
  const first = auto([trade("3", 3)]);
  manual("m2", [trade("4", 4)]);
  manual("m3", [trade("5", 5), trade("6", 6)]);
  assert.equal(auto([trade("7", 7)]), first, "the accumulated row stays the target");
  assert.equal(auto([trade("8", 8)]), first);
  const full = imports.filter((x) => x.rows.length === 8);
  assert.equal(full.length, 1, "only one import holds every trade");
  assert.deepEqual(full[0].rows.map((x) => x.id), ["1", "2", "3", "4", "5", "6", "7", "8"]);
});
