import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import type pg from "pg";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { registerGoogle } from "../src/auth.js";

test("Google admin entry accepts only the verified allowed email and preserves public login", async () => {
  const savedFetch = globalThis.fetch;
  const oldId = process.env.GOOGLE_CLIENT_ID,
    oldSecret = process.env.GOOGLE_CLIENT_SECRET;
  process.env.GOOGLE_CLIENT_ID = "test-client";
  process.env.GOOGLE_CLIENT_SECRET = "test-secret";
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = {
    ...(await exportJWK(publicKey)),
    kid: "test",
    alg: "RS256",
    use: "sig",
  };
  let token = "";
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === "https://www.googleapis.com/oauth2/v3/certs")
      return new Response(JSON.stringify({ keys: [jwk] }), { status: 200 });
    if (url === "https://oauth2.googleapis.com/token")
      return new Response(JSON.stringify({ id_token: token }), { status: 200 });
    throw new Error("unexpected network request");
  };
  try {
    for (const scenario of [
      {
        admin: true,
        email: "kirdssadee@gmail.com",
        verified: true,
        nonce: true,
        accepted: true,
      },
      {
        admin: true,
        email: "someone@gmail.com",
        verified: true,
        nonce: true,
        accepted: false,
      },
      {
        admin: true,
        email: "kirdssadee@gmail.com",
        verified: false,
        nonce: true,
        accepted: false,
      },
      {
        admin: true,
        email: "kirdssadee@gmail.com",
        verified: true,
        nonce: false,
        accepted: false,
      },
      {
        admin: false,
        email: "customer@gmail.com",
        verified: true,
        nonce: true,
        accepted: true,
      },
    ]) {
      let attempt: any,
        users = 0,
        sessions = 0;
      const db = {
        query: async (sql: string, args: any[] = []) => {
          if (sql.startsWith("INSERT INTO oauth_attempts")) {
            attempt = { nonce: args[2], purpose: args[3] };
            return { rows: [], rowCount: 1 };
          }
          if (sql.startsWith("DELETE FROM oauth_attempts WHERE state_hash"))
            return { rows: [attempt], rowCount: 1 };
          if (sql.startsWith("INSERT INTO users")) {
            users++;
            return { rows: [{ id: "test-user" }], rowCount: 1 };
          }
          return { rows: [], rowCount: 0 };
        },
      } as unknown as pg.Pool;
      const app = Fastify();
      await app.register(cookie);
      registerGoogle(app, db, "http://localhost:4173", async () => {
        sessions++;
      });
      try {
        const start = await app.inject({
          url: `/api/v1/auth/google${scenario.admin ? "?admin=1" : ""}`,
        });
        assert.equal(start.statusCode, 302);
        const state = new URL(start.headers.location!).searchParams.get(
          "state",
        )!;
        assert.equal(
          new URL(start.headers.location!).searchParams.get("redirect_uri"),
          "http://localhost:4173/api/v1/auth/google/callback",
        );
        token = await new SignJWT({
          email: scenario.email,
          email_verified: scenario.verified,
          nonce: scenario.nonce ? attempt.nonce : "wrong",
        })
          .setProtectedHeader({ alg: "RS256", kid: "test" })
          .setIssuer("https://accounts.google.com")
          .setAudience("test-client")
          .setSubject("stable-google-sub")
          .setIssuedAt()
          .setExpirationTime("5m")
          .sign(privateKey);
        // Tampering with the navigation cookie cannot change the server-stored purpose.
        const cookies =
          start.cookies
            .filter((c) => c.name === "snaap_oauth")
            .map((c) => `${c.name}=${c.value}`)
            .join("; ") +
          `; snaap_oauth_purpose=${scenario.admin ? "public" : "admin"}`;
        const callback = await app.inject({
          url: `/api/v1/auth/google/callback?state=${state}&code=test-code`,
          headers: { cookie: cookies },
        });
        assert.equal(
          sessions,
          scenario.accepted ? 1 : 0,
          JSON.stringify(scenario),
        );
        assert.equal(
          users,
          scenario.accepted ? 1 : 0,
          "denied admin identities never create accounts or sessions",
        );
        assert.equal(
          callback.headers.location,
          scenario.accepted
            ? scenario.admin
              ? "/admin"
              : "/#home"
            : `/admin/login?error=${scenario.verified && scenario.nonce ? "admin_denied" : "failed"}`,
        );
      } finally {
        await app.close();
      }
    }
  } finally {
    globalThis.fetch = savedFetch;
    if (oldId === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = oldId;
    if (oldSecret === undefined) delete process.env.GOOGLE_CLIENT_SECRET;
    else process.env.GOOGLE_CLIENT_SECRET = oldSecret;
  }
});
