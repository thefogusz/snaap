import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
export async function localEncryptionKey(root = path.resolve(".local")) {
  const supplied = process.env.DATA_ENCRYPTION_KEY;
  if (supplied) {
    if (!/^[a-f0-9]{64}$/i.test(supplied))
      throw new Error("Invalid DATA_ENCRYPTION_KEY");
    return supplied;
  }
  await mkdir(root, { recursive: true });
  const file = path.join(root, "data-encryption.key");
  let value: string;
  try {
    value = (await readFile(file, "utf8")).trim();
  } catch (error: any) {
    if (error.code !== "ENOENT") throw error;
    try {
      await writeFile(file, randomBytes(32).toString("hex"), {
        flag: "wx",
        mode: 0o600,
      });
    } catch (createError: any) {
      if (createError.code !== "EEXIST") throw createError;
    }
    value = (await readFile(file, "utf8")).trim();
  }
  if (!/^[a-f0-9]{64}$/i.test(value))
    throw new Error(
      "Invalid local encryption key file; preserve it and restore the original key",
    );
  return value;
}
