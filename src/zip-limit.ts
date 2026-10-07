import { inflateRawSync } from "node:zlib";

const LIMIT = 30 * 1024 * 1024;

/**
 * Bound XLSX expansion before passing it to the XML reader; reject ZIP64/encryption.
 * read-excel-file streams local headers rather than trusting the central directory, so the
 * local entries are walked in order exactly as a streaming reader would see them, each is
 * actually inflated under the remaining budget, and every byte before the central directory
 * must belong to an entry the directory declares with the same sizes.
 */
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
  const declared = new Map<number, { method: number; compressed: number; size: number }>();
  let cursor = offset,
    total = 0;
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || buffer.readUInt32LE(cursor) !== 0x02014b50)
      throw new Error("INVALID_XLSX");
    if (buffer.readUInt16LE(cursor + 8) & 1) throw new Error("ENCRYPTED_XLSX");
    const size = buffer.readUInt32LE(cursor + 24);
    total += size;
    if (total > LIMIT) throw new Error("XLSX_LIMIT");
    const local = buffer.readUInt32LE(cursor + 42);
    if (declared.has(local)) throw new Error("INVALID_XLSX");
    declared.set(local, {
      method: buffer.readUInt16LE(cursor + 10),
      compressed: buffer.readUInt32LE(cursor + 20),
      size,
    });
    cursor +=
      46 +
      buffer.readUInt16LE(cursor + 28) +
      buffer.readUInt16LE(cursor + 30) +
      buffer.readUInt16LE(cursor + 32);
  }
  if (cursor > end) throw new Error("INVALID_XLSX");

  let position = 0,
    inflated = 0,
    seen = 0;
  while (position < offset) {
    const entry = declared.get(position);
    if (!entry || position + 30 > offset || buffer.readUInt32LE(position) !== 0x04034b50)
      throw new Error("INVALID_XLSX");
    const flags = buffer.readUInt16LE(position + 6),
      method = buffer.readUInt16LE(position + 8);
    if (flags & 1) throw new Error("ENCRYPTED_XLSX");
    if (method !== entry.method || (method !== 0 && method !== 8))
      throw new Error("INVALID_XLSX");
    const descriptor = (flags & 8) !== 0;
    if (
      !descriptor &&
      (buffer.readUInt32LE(position + 18) !== entry.compressed ||
        buffer.readUInt32LE(position + 22) !== entry.size)
    )
      throw new Error("INVALID_XLSX");
    const start =
      position + 30 + buffer.readUInt16LE(position + 26) + buffer.readUInt16LE(position + 28);
    const stop = start + entry.compressed;
    if (stop > offset) throw new Error("INVALID_XLSX");
    const remaining = LIMIT - inflated;
    let size = entry.compressed;
    if (method === 8) {
      let result: { buffer: Buffer; engine: { bytesWritten: number } };
      try {
        result = inflateRawSync(buffer.subarray(start, stop), {
          maxOutputLength: Math.max(1, remaining),
          info: true,
        }) as any;
      } catch (error) {
        throw new Error(error instanceof RangeError ? "XLSX_LIMIT" : "INVALID_XLSX");
      }
      // A deflate stream that ends early would let a streaming reader parse the rest as entries.
      if (result.engine.bytesWritten !== entry.compressed) throw new Error("INVALID_XLSX");
      size = result.buffer.length;
    }
    if (size !== entry.size) throw new Error("INVALID_XLSX");
    inflated += size;
    if (inflated > LIMIT) throw new Error("XLSX_LIMIT");
    position = stop;
    if (descriptor) {
      if (position + 4 <= offset && buffer.readUInt32LE(position) === 0x08074b50) position += 4;
      if (position + 12 > offset) throw new Error("INVALID_XLSX");
      position += 12;
    }
    seen++;
  }
  if (position !== offset || seen !== count) throw new Error("INVALID_XLSX");
}
