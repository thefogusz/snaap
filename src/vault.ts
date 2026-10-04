import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
function key() {
  const raw = process.env.DATA_ENCRYPTION_KEY;
  if (!raw || !/^[a-f0-9]{64}$/i.test(raw))
    throw new Error("ENCRYPTION_KEY_REQUIRED");
  return Buffer.from(raw, "hex");
}
export function seal(value: unknown, scope: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(scope));
  const bytes = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), bytes]
    .map((x) => x.toString("base64"))
    .join(".");
}
export function unseal(value: string, scope: string) {
  const [iv, tag, bytes] = value
    .split(".")
    .map((x) => Buffer.from(x, "base64"));
  const cipher = createDecipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(scope));
  cipher.setAuthTag(tag);
  return JSON.parse(
    Buffer.concat([cipher.update(bytes), cipher.final()]).toString("utf8"),
  );
}
