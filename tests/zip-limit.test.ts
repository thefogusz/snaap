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

import { deflateRawSync } from "node:zlib";
type Entry = { name: string; data: Buffer; declared?: number; hidden?: boolean };
// Minimal ZIP writer: deflated entries, optional false declared sizes or entries missing from the directory.
function zip(entries: Entry[]) {
  const locals: Buffer[] = [], central: Buffer[] = [];
  let offset = 0, listed = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name), body = deflateRawSync(entry.data);
    const size = entry.declared ?? entry.data.length;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(body.length, 18); local.writeUInt32LE(size, 22); local.writeUInt16LE(name.length, 26);
    if (!entry.hidden) {
      const record = Buffer.alloc(46);
      record.writeUInt32LE(0x02014b50, 0); record.writeUInt16LE(20, 4); record.writeUInt16LE(20, 6); record.writeUInt16LE(8, 10);
      record.writeUInt32LE(body.length, 20); record.writeUInt32LE(size, 24); record.writeUInt16LE(name.length, 28); record.writeUInt32LE(offset, 42);
      central.push(record, name); listed++;
    }
    locals.push(local, name, body);
    offset += 30 + name.length + body.length;
  }
  const directory = Buffer.concat(central), tail = Buffer.alloc(22);
  tail.writeUInt32LE(0x06054b50, 0); tail.writeUInt16LE(listed, 8); tail.writeUInt16LE(listed, 10);
  tail.writeUInt32LE(directory.length, 12); tail.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, tail]);
}
test("accepts a well-formed archive and checks actual inflated size, not declared size", () => {
  checkXlsxSize(zip([{ name: "[Content_Types].xml", data: Buffer.from("<Types/>") }, { name: "xl/workbook.xml", data: Buffer.alloc(4096, 65) }]));
  const bomb = Buffer.alloc(40 * 1024 * 1024);
  assert.throws(() => checkXlsxSize(zip([{ name: "xl/sheet1.xml", data: bomb, declared: 1000 }])), /XLSX_LIMIT|INVALID_XLSX/);
  assert.throws(() => checkXlsxSize(zip([{ name: "a.xml", data: Buffer.alloc(100), declared: 10 }])), /INVALID_XLSX/);
});
test("rejects local entries a streaming reader would inflate but the directory hides", () => {
  assert.throws(() => checkXlsxSize(zip([
    { name: "[Content_Types].xml", data: Buffer.from("<Types/>") },
    { name: "xl/hidden.xml", data: Buffer.alloc(1 << 20), hidden: true },
  ])), /INVALID_XLSX/);
});
