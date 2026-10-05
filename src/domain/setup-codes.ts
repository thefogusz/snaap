import { randomBytes, createHash } from "node:crypto";
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function makeSetupCode() {
  const body = [...randomBytes(12)].map((byte) => alphabet[byte & 31]).join("");
  return "SNAAP-" + body.match(/.{4}/g)!.join("-");
}
export function normalizeSetupCode(input: string) {
  const value = input.trim().toUpperCase().replace(/[\s-]/g, "");
  if (!/^SNAAP[A-HJ-NP-Z2-9]{12}$/.test(value))
    throw Error("โค้ดเซ็ตอัพไม่ถูกต้อง");
  return "SNAAP-" + value.slice(5).match(/.{4}/g)!.join("-");
}
export function setupCodeHash(input: string) {
  return createHash("sha256").update(normalizeSetupCode(input)).digest("hex");
}
