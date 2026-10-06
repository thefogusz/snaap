import type { FastifyInstance, FastifyReply } from "fastify";
import type pg from "pg";
import {
  randomBytes,
  randomUUID,
  createHash,
  timingSafeEqual,
} from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import { ADMIN_EMAIL } from "./admin-access.js";

const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const callbackQuery = z.object({
  state: z.string().regex(/^[a-f0-9]{64}$/),
  code: z.string().min(1).max(4096).optional(),
  error: z.string().max(100).optional(),
});

export function registerGoogle(
  app: FastifyInstance,
  db: pg.Pool,
  origin: string,
  session: (id: string, reply: FastifyReply) => Promise<void>,
) {
  const keys = createRemoteJWKSet(
    new URL("https://www.googleapis.com/oauth2/v3/certs"),
  );
  const cookieOptions = {
    httpOnly: true,
    secure: new URL(origin).protocol === "https:",
    sameSite: "lax" as const,
    path: "/api/v1/auth/",
    maxAge: 600,
  };
  app.get("/api/v1/auth/google", async (req, reply) => {
    const purpose = z
      .object({ admin: z.literal("1").optional() })
      .parse(req.query).admin
      ? "admin"
      : "public";
    const fail = (reply: FastifyReply, reason: string) =>
      reply.redirect(
        `${purpose === "admin" ? "/admin/login" : "/login.html"}?error=${reason}`,
      );
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET)
      return fail(reply, "not_configured");
    const state = randomBytes(32).toString("hex");
    const verifier = randomBytes(32).toString("base64url");
    const nonce = randomBytes(32).toString("hex");
    // Server-side expiry and atomic consumption prevent callback replay.
    await db.query("DELETE FROM oauth_attempts WHERE expires_at<=now()");
    await db.query(
      "INSERT INTO oauth_attempts(state_hash,verifier_hash,nonce,expires_at,purpose) VALUES($1,$2,$3,now()+interval '10 minutes',$4)",
      [digest(state), digest(verifier), nonce, purpose],
    );
    reply.setCookie("snaap_oauth", `${state}.${verifier}`, cookieOptions);
    reply.setCookie("snaap_oauth_purpose", purpose, cookieOptions);
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      redirect_uri: `${origin}/api/v1/auth/google/callback`,
      response_type: "code",
      scope: "openid email",
      state,
      nonce,
      prompt: "select_account",
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
    }).toString();
    return reply.redirect(url.href);
  });
  app.get("/api/v1/auth/google/callback", async (req, reply) => {
    let adminFlow = req.cookies.snaap_oauth_purpose === "admin";
    const fail = (reply: FastifyReply, reason: string) =>
      reply.redirect(
        `${adminFlow ? "/admin/login" : "/login.html"}?error=${reason}`,
      );
    reply.header("Referrer-Policy", "no-referrer");
    const parsed = callbackQuery.safeParse(req.query);
    const saved = req.cookies.snaap_oauth?.split(".");
    reply.clearCookie("snaap_oauth", { path: cookieOptions.path });
    reply.clearCookie("snaap_oauth_purpose", { path: cookieOptions.path });
    if (
      !parsed.success ||
      saved?.length !== 2 ||
      !/^[a-f0-9]{64}$/.test(saved[0]!) ||
      !/^[A-Za-z0-9_-]{43}$/.test(saved[1]!) ||
      !timingSafeEqual(Buffer.from(parsed.data.state), Buffer.from(saved[0]!))
    )
      return fail(reply, "expired");
    const query = parsed.data;
    try {
      const attempt = await db.query(
        "DELETE FROM oauth_attempts WHERE state_hash=$1 AND verifier_hash=$2 AND expires_at>now() RETURNING nonce,purpose",
        [digest(query.state), digest(saved[1]!)],
      );
      if (!attempt.rowCount) return fail(reply, "expired");
      adminFlow = attempt.rows[0].purpose === "admin";
      if (query.error)
        return fail(
          reply,
          query.error === "access_denied" ? "cancelled" : "failed",
        );
      if (
        !query.code ||
        !process.env.GOOGLE_CLIENT_ID ||
        !process.env.GOOGLE_CLIENT_SECRET
      )
        return fail(reply, "failed");
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        redirect: "error",
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          redirect_uri: `${origin}/api/v1/auth/google/callback`,
          code: query.code,
          code_verifier: saved[1]!,
          grant_type: "authorization_code",
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) return fail(reply, "failed");
      const tokens = z
        .object({ id_token: z.string().min(1).max(16384) })
        .parse(await response.json());
      const { payload } = await jwtVerify(tokens.id_token, keys, {
        algorithms: ["RS256"],
        audience: process.env.GOOGLE_CLIENT_ID,
        issuer: ["https://accounts.google.com", "accounts.google.com"],
        requiredClaims: [
          "sub",
          "exp",
          "iat",
          "nonce",
          "email",
          "email_verified",
        ],
      });
      if (
        payload.nonce !== attempt.rows[0].nonce ||
        payload.email_verified !== true ||
        typeof payload.email !== "string" ||
        !z.email().safeParse(payload.email).success ||
        typeof payload.sub !== "string" ||
        !payload.sub ||
        payload.sub.length > 255 ||
        (payload.azp !== undefined &&
          payload.azp !== process.env.GOOGLE_CLIENT_ID)
      )
        return fail(reply, "failed");
      if (adminFlow && payload.email.toLowerCase() !== ADMIN_EMAIL)
        return fail(reply, "admin_denied");
      // Public signup: every verified Google identity gets its own account.
      // Identify accounts by Google's stable sub; never merge accounts by email.
      const row = await db.query(
        "INSERT INTO users(id,google_sub,email) VALUES($1,$2,$3) ON CONFLICT(google_sub) DO UPDATE SET email=excluded.email RETURNING id",
        [randomUUID(), payload.sub, payload.email],
      );
      if (req.cookies.snaap_session)
        await db.query("DELETE FROM sessions WHERE token_hash=$1", [
          digest(req.cookies.snaap_session),
        ]);
      await session(row.rows[0].id, reply);
      return reply.redirect(adminFlow ? "/admin" : "/home");
    } catch {
      // Never expose authorization codes, tokens, provider replies or DB errors.
      return fail(reply, "failed");
    }
  });
}
