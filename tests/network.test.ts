import { test } from "node:test";
import assert from "node:assert/strict";
import { publicIPv4, postWebhook } from "../src/network.js";
test("webhook rejects private, reserved, mapped and IPv6 addresses", () => {
  for (const ip of [
    "127.0.0.1",
    "10.0.1.1",
    "172.16.1.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.1.1",
    "198.18.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "224.0.0.1",
  ])
    assert.equal(publicIPv4(ip), false, ip);
  assert.equal(publicIPv4("8.8.8.8"), true);
});
test("webhook cannot send to arbitrary or local destinations", async () => {
  await assert.rejects(postWebhook("http://localhost/a", "{}"));
  await assert.rejects(postWebhook("https://unapproved.invalid/a", "{}"));
});
