import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
const audit = JSON.parse(
  await readFile(".local/audit/chat-results.json", "utf8"),
);
const cases = new Map<string, any>(audit.results.map((r: any) => [r.name, r]));
for (const r of audit.results) assert.equal(r.status, 200, r.name);
const create = cases.get("create").result.draft,
  edit = cases.get("edit").result.draft;
assert.equal(create.entry.children[0].right.value, 30);
assert.equal(edit.entry.children[0].right.value, 35);
const expected = structuredClone(create);
expected.entry.children[0].right.value = 35;
assert.deepEqual(edit, expected);
assert.ok(cases.get("add-exit").result.draft.exit);
assert.equal(cases.get("remove-exit").result.draft.exit, undefined);
assert.deepEqual(cases.get("remove-exit").result.draft, edit);
const short = cases.get("short").result.draft;
assert.equal(short.market, "Perpetual Futures");
assert.equal(short.side, "SHORT");
assert.equal(short.mirrorShort, undefined);
assert.equal(short.entry.children[0].op, "CROSS_BELOW");
assert.equal(short.entry.children[0].right.value, 70);
assert.equal(short.entry.children[1].op, "<");
assert.deepEqual(short.destinations, []);
for (const name of ["unsupported", "research", "risk", "replay"])
  assert.equal(cases.get(name).result.draft, null, name);
for (const [name, skill] of [
  ["research", "research-validation"],
  ["risk", "risk-review"],
])
  assert.ok(
    cases
      .get(name)
      .trace.some(
        (t: any) =>
          t.tool === "read_skill" && t.result.name === skill && t.result.loaded,
      ),
  );
const replay = cases
  .get("replay")
  .trace.find((t: any) => t.tool === "replay_strategy").result;
assert.deepEqual(replay.spec, short);
const image = JSON.parse(
  await readFile(".local/audit/image-results.json", "utf8"),
);
assert.equal(image.uploadStatus, 201);
assert.equal(image.status, 200);
const data = JSON.parse(
  await readFile(".local/audit/data-results.json", "utf8"),
);
assert.equal(data.status, 200);
assert.equal(data.result.draft, null);
assert.equal(data.sourceUnavailable, true);
assert.ok(
  data.trace.some(
    (t: any) => t.tool === "read_skill" && t.result.name === "trade-journal",
  ),
);
const finalReplay = JSON.parse(
  await readFile(".local/audit/chat-replay-results.json", "utf8"),
).results[0];
assert.equal(finalReplay.status, 200);
const coverage = finalReplay.trace.find(
  (t: any) => t.tool === "replay_strategy",
).result.coverage;
assert.match(coverage.firstClosedAt, /^2026-/);
assert.match(coverage.lastClosedAt, /^2026-/);
await writeFile(
  ".local/audit/summary.json",
  JSON.stringify(
    {
      lifecycle: 9,
      image: 1,
      tradeJournal: 1,
      allHttp200: true,
      exactThresholdOnlyEdit: true,
      exitRemoved: true,
      shortDirectionCorrect: true,
      replayMatchesDraft: true,
      coverage,
      limitations: [
        "Manual semantic review remains necessary",
        "Browser file upload end-to-end not confirmed",
        "Live external billing/auth/delivery/exchange account sync not configured",
      ],
    },
    null,
    2,
  ),
);
console.log(
  "PASS 11 live AI scenarios: HTTP, exact draft edits/removal, Short, skill routing, canonical replay, images and trade journal",
);
console.log("Coverage:", JSON.stringify(coverage));
