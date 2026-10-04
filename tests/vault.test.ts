import { test } from "node:test";
import assert from "node:assert/strict";
import { seal, unseal } from "../src/vault.js";
test("encrypted credentials cannot be moved between owners or altered", () => {
  process.env.DATA_ENCRYPTION_KEY = "01".repeat(32);
  const value = seal({ apiKey: "test-only" }, "owner:connection");
  assert.equal(value.includes("test-only"), false);
  assert.deepEqual(unseal(value, "owner:connection"), { apiKey: "test-only" });
  assert.throws(() => unseal(value, "other:connection"));
  const parts = value.split(".");
  parts[1] = Buffer.alloc(16).toString("base64");
  assert.throws(() => unseal(parts.join("."), "owner:connection"));
  delete process.env.DATA_ENCRYPTION_KEY;
});
