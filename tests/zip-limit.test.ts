import { test } from "node:test";
import assert from "node:assert/strict";
import { checkXlsxSize } from "../src/zip-limit.js";
test("rejects oversized XLSX expansion before decompressing", () => {
  const b = Buffer.alloc(69);
  b.writeUInt32LE(0x02014b50, 1);
  b.writeUInt32LE(100 * 1024 * 1024, 25);
  b.writeUInt32LE(0x06054b50, 47);
  b.writeUInt16LE(1, 57);
  b.writeUInt32LE(1, 63);
  assert.throws(() => checkXlsxSize(b), /XLSX_LIMIT/);
  assert.throws(() => checkXlsxSize(Buffer.from("not a zip")));
});
