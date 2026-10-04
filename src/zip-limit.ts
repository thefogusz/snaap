/** Bound declared XLSX expansion before passing it to the XML reader; reject ZIP64/encryption. */
export function checkXlsxSize(buffer: Buffer) {
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--)
    if (
      buffer.readUInt32LE(i) === 0x06054b50 &&
      i + 22 + buffer.readUInt16LE(i + 20) === buffer.length
    ) {
      end = i;
      break;
    }
  if (end < 0) throw new Error("INVALID_XLSX");
  const count = buffer.readUInt16LE(end + 10),
    offset = buffer.readUInt32LE(end + 16);
  if (count > 100 || count === 0 || offset >= end)
    throw new Error("XLSX_LIMIT");
  let cursor = offset,
    total = 0;
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || buffer.readUInt32LE(cursor) !== 0x02014b50)
      throw new Error("INVALID_XLSX");
    if (buffer.readUInt16LE(cursor + 8) & 1) throw new Error("ENCRYPTED_XLSX");
    const size = buffer.readUInt32LE(cursor + 24);
    total += size;
    if (total > 30 * 1024 * 1024) throw new Error("XLSX_LIMIT");
    cursor +=
      46 +
      buffer.readUInt16LE(cursor + 28) +
      buffer.readUInt16LE(cursor + 30) +
      buffer.readUInt16LE(cursor + 32);
  }
  if (cursor > end) throw new Error("INVALID_XLSX");
}
