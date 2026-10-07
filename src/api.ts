import { userLimits, usagePolicy, usagePolicySchema } from './usage-policy.js';
import { assertAccess } from './access-controls.js';
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import staticFiles from "@fastify/static";
import rateLimit from "@fastify/rate-limit";
import { randomUUID, randomBytes, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import type pg from "pg";
import { transaction } from "./data/db.js";
import { strategySchema, frames } from "./domain/engine.js";
import { signalValidUntil } from "./signal-validity.js";
import { registerGoogle } from "./auth.js";
import { registerFiles, cleanupChatImages } from "./files.js";
import { registerHarness, type HarnessDependencies } from "./ai/harness.js";
import { registerMarkets, instruments, validateTargets } from "./markets.js";
import { registerBilling } from "./billing.js";
import { registerDestinations } from "./destinations.js";
import { registerHistory } from "./history.js";
import { sourceIds } from "./context.js";
import { registerWorkspaces } from "./workspaces.js";
import { registerSetupFiles } from "./setup-files.js";
import { registerSetupShares } from "./setup-shares.js";
import { registerPresets } from "./presets.js";
import { registerRuleRemoval } from "./rule-removal.js";
import { registerConversationRemoval } from "./conversation-removal.js";
import { registerEntryFlexibility } from "./entry-flexibility.js";
import { registerRuleDestinations } from "./rule-destinations.js";
import { registerAdmin, recordSystemLog, isUserAdmin } from "./admin.js";
import { isAdminIdentity } from "./admin-access.js";
import { recordApiIncident } from "./admin-events.js";
import { ApiError } from "./errors.js";
import { hash } from "./crypto.js";
export { ApiError } from "./errors.js";
export { hash } from "./crypto.js";
declare module "fastify" {
  interface FastifyRequest {
    userId: string;
    workspaceId?: string;
  }
}
export async function buildApp(
  db: pg.Pool,
  options: {
    local?: boolean;
    developerPro?: boolean;
    origin?: string;
    monitoring?: boolean;
    presetInstruments?: typeof instruments;
    harnessDependencies?: HarnessDependencies;
    validateMarket?: (
      spec: import("./domain/engine.js").Strategy,
    ) => Promise<void>;
  } = {},
) {
  const origin = options.origin ?? "http://127.0.0.1:4173";
  const allowedHost = new URL(origin).host;
  const app = Fastify({
    logger: false,
    bodyLimit: 2 * 1024 * 1024,
    ajv: { customOptions: { removeAdditional: false } },
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    max: async () => (await usagePolicy(db)).requestsPerMinute,
    timeWindow: "1 minute",
    hook: "preHandler",
    keyGenerator: (req) => req.userId || req.ip,
    errorResponseBuilder: (_req, context) =>
      new ApiError(429, "RATE_LIMITED", `ส่งคำขอถี่เกินไป กรุณารอ ${Math.ceil(context.ttl / 1000)} วินาทีแล้วลองใหม่`),
  });
  app.decorateRequest("userId", "");
  app.setErrorHandler((err, req, reply) => {
    recordSystemLog({
      type: (err as any).code || (err as any).name || "ERROR",
      statusCode:
        (err as any).statusCode || (err instanceof z.ZodError ? 400 : 500),
      message: err instanceof ApiError ? err.code : "คำขอทำงานไม่สำเร็จ",
      url: req.routeOptions.url ?? "/unknown",
      method: req.method,
      userId: req.userId || undefined,
    });
    if (!(err instanceof z.ZodError) && !(err as ApiError).statusCode)
      console.error("Request failed", req.id, (err as Error).name);
    if (err instanceof z.ZodError)
      return reply.code(400).send({
        error: {
          code: "VALIDATION",
          message: "ข้อมูลไม่ถูกต้อง",
          details: err.issues.map((x) => ({
            path: x.path,
            message: x.message,
          })),
        },
      });
    const error = err as ApiError;
    return reply.code(error.statusCode ?? 500).send({
      error: {
        code: error.code ?? "INTERNAL",
        message: error.statusCode
          ? error.message
          : "ระบบทำงานไม่สำเร็จ กรุณาลองใหม่",
      },
    });
  });
  const apiIncidents = new Set<string>();
  app.addHook("onReady", async () => {
    const result = await db
      .query(
        "SELECT event_key FROM admin_events WHERE event_key LIKE 'api:%' AND status='open'",
      )
      .catch(() => ({ rows: [] }));
    for (const event of result.rows) apiIncidents.add(event.event_key);
  });
  app.addHook("onSend", async (req, reply, payload) => {
    const route = req.routeOptions.url ?? "/unknown";
    const key = `api:${req.method} ${route}`;
    if (reply.statusCode >= 500) {
      apiIncidents.add(key);
      await recordApiIncident(db, req.method, route, reply.statusCode).catch(
        () => {},
      );
    } else if (reply.statusCode < 400 && apiIncidents.has(key)) {
      await db
        .query(
          "UPDATE admin_events SET status='resolved',severity='success',title='API กลับมาทำงาน',detail=$2,resolved_at=now(),updated_at=now() WHERE event_key=$1 AND status='open'",
          [key, `${req.method} ${route} · HTTP ${reply.statusCode}`],
        )
        .then(() => apiIncidents.delete(key))
        .catch(() => {});
    }
    return payload;
  });
  app.addHook("onRequest", async (req, reply) => {
    reply
      .header("X-Content-Type-Options", "nosniff")
      .header("X-Frame-Options", "DENY")
      .header("Referrer-Policy", "same-origin")
      .header("Cache-Control", "no-store");
    let pagePath: string;
    try {
      pagePath =
        path.posix
          .normalize(
            decodeURIComponent(new URL(req.url, origin).pathname).replaceAll(
              "\\",
              "/",
            ),
          )
          .toLowerCase()
          .replace(/\/$/, "") || "/";
    } catch {
      throw new ApiError(400, "INVALID_URL", "รูปแบบ URL ไม่ถูกต้อง");
    }
    if (
      ["/home", "/notifications", "/history", "/watch", "/billing", "/index.html", "/login.html"].includes(pagePath) ||
      pagePath === "/admin" || pagePath.startsWith("/admin/") ||
      ["/admin.html", "/admin-login.html"].includes(pagePath) || pagePath.startsWith("/api/")
    ) reply.header("X-Robots-Tag", "noindex, nofollow");
    if (
      pagePath === "/admin" ||
      pagePath.startsWith("/admin/") ||
      pagePath === "/admin.html" ||
      pagePath === "/admin-login.html"
    )
      reply.header(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-src https://www.tradingview-widget.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
      );
    const railwayHealthcheck =
      !!process.env.RAILWAY_PROJECT_ID &&
      req.headers.host === "healthcheck.railway.app" &&
      req.method === "GET" &&
      req.url === "/api/v1/health";
    if (req.headers.host !== allowedHost && !railwayHealthcheck)
      throw new ApiError(403, "HOST", "ไม่อนุญาต host นี้");
    if (req.headers.origin && req.headers.origin !== origin)
      throw new ApiError(403, "ORIGIN", "ไม่อนุญาตคำขอจากเว็บไซต์อื่น");
    const publicPageNavigation =
      req.method === "GET" &&
      req.headers["sec-fetch-mode"] === "navigate" &&
      req.headers["sec-fetch-dest"] === "document" &&
      !req.url.startsWith("/api/");
    if (
      req.headers["sec-fetch-site"] === "cross-site" &&
      !publicPageNavigation &&
      !req.url.startsWith("/api/v1/auth/google/callback")
    )
      throw new ApiError(403, "ORIGIN", "ไม่อนุญาตคำขอข้ามเว็บไซต์");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      !req.url.startsWith("/api/v1/hooks/") &&
      req.headers["x-snaap-client"] !== "web"
    )
      throw new ApiError(403, "CSRF", "คำขอไม่มี client header");
    if (
      ["GET", "HEAD"].includes(req.method) &&
      ["/admin", "/admin/", "/admin.html"].includes(pagePath)
    ) {
      const token = req.cookies.snaap_session;
      const sessionUser = token
        ? (
            await db.query(
              "SELECT user_id FROM sessions WHERE token_hash=$1 AND expires_at>now()",
              [hash(token)],
            )
          ).rows[0]
        : undefined;
      if (!sessionUser) return reply.redirect("/admin/login");
      if (!(await isUserAdmin(db, sessionUser.user_id)).isAdmin)
        return reply.redirect("/admin/login?error=admin_denied");
      if (pagePath !== "/admin") return reply.redirect("/admin");
    }
    if (
      !req.url.startsWith("/api/v1/") ||
      req.url.startsWith("/api/v1/auth/") ||
      req.url.startsWith("/api/v1/hooks/") ||
      req.url === "/api/v1/health"
    )
      return;
    const token = req.cookies.snaap_session;
    if (!token) throw new ApiError(401, "UNAUTHENTICATED", "กรุณาเข้าสู่ระบบ");
    const result = await db.query(
      "SELECT user_id FROM sessions WHERE token_hash=$1 AND expires_at>now()",
      [hash(token)],
    );
    if (!result.rowCount)
      throw new ApiError(401, "UNAUTHENTICATED", "เซสชันหมดอายุ");
    req.userId = result.rows[0].user_id;
    await assertAccess(db,req.userId,'account');
    const selected = req.headers["x-snaap-workspace"];
    if (selected) {
      const id = z.string().uuid().parse(selected);
      if (
        !(
          await db.query(
            "SELECT id FROM workspaces WHERE id=$1 AND owner_id=$2",
            [id, req.userId],
          )
        ).rowCount
      )
        throw new ApiError(403, "WORKSPACE_FORBIDDEN", "ไม่พบเวิร์กสเปซของคุณ");
      req.workspaceId = id;
    }
  });
  async function session(userId: string, reply: any, lifetimeSeconds = 604800) {
    const token = randomBytes(32).toString("hex");
    await transaction(db,async c => {
      await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[userId]);
      await assertAccess(c,userId,'account');
      await c.query("DELETE FROM sessions WHERE expires_at<=now()");
      await c.query(
        "INSERT INTO sessions VALUES($1,$2,now()+$3*interval '1 second')",
        [hash(token), userId, lifetimeSeconds],
      );
    });
    reply.setCookie("snaap_session", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: origin.startsWith("https"),
      path: "/",
      maxAge: lifetimeSeconds,
    });
    return token;
  }
  registerGoogle(app, db, origin, async (id, reply) => {
    await session(id, reply);
  });
  registerWorkspaces(app, db);
  await registerFiles(app, db);
  registerHarness(app, db, options.harnessDependencies);
  registerMarkets(app, db, !!options.monitoring);
  await registerBilling(app, db, origin);
  await registerDestinations(app, db, { local: options.local, origin });
  registerHistory(app, db);
  registerAdmin(app, db, {
    local: options.local,
    monitoring: options.monitoring,
    session,
  });
  app.get("/api/v1/health", async () => ({
    database: (await db.query("SELECT 1")).rowCount === 1,
    local: !!options.local,
    ai: !!process.env.AI_API_KEY,
    google: !!(
      process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ),
    billing: !!(
      process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET
    ),
    providerVerification:
      "Configuration only; end-to-end verification required",
    monitoring: !!options.monitoring,
  }));
  app.post("/api/v1/auth/local", async (req, reply) => {
    if (!options.local || !["127.0.0.1", "::1"].includes(req.ip))
      throw new ApiError(404, "NOT_FOUND", "ไม่พบ");
    const id = "00000000-0000-4000-8000-000000000001";
    await db.query(
      "INSERT INTO users(id,email) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [id, "local@snaap.invalid"],
    );
    if (options.developerPro)
      await db.query(
        "INSERT INTO entitlements(owner_id,pro_until) VALUES($1,now()+interval '30 days') ON CONFLICT(owner_id) DO UPDATE SET pro_until=GREATEST(COALESCE(entitlements.pro_until,now()),EXCLUDED.pro_until)",
        [id],
      );
    await session(id, reply);
    return { local: true };
  });
  app.post("/api/v1/auth/logout", async (req, reply) => {
    const oauthState = req.cookies.snaap_oauth?.split(".")[0];
    if (oauthState)
      await db.query("DELETE FROM oauth_attempts WHERE state_hash=$1", [
        hash(oauthState),
      ]);
    reply.clearCookie("snaap_oauth", { path: "/api/v1/auth/" });
    reply.clearCookie("snaap_oauth_purpose", { path: "/api/v1/auth/" });
    if (req.cookies.snaap_session)
      await db.query("DELETE FROM sessions WHERE token_hash=$1", [
        hash(req.cookies.snaap_session),
      ]);
    reply.clearCookie("snaap_session", { path: "/" });
    return { ok: true };
  });
  app.get("/api/v1/me", async (req) => {
    const { policy: settings, active, pro_until, impersonating, usage, ...user } = (
      await db.query(`SELECT u.id,u.email,u.role,u.google_sub,e.pro_until,
        EXISTS(SELECT 1 FROM admin_impersonations WHERE session_hash=$2) AS impersonating,
        coalesce((SELECT policy FROM usage_policy WHERE id=1),'{}'::jsonb) AS policy,
        (SELECT count(*)::int FROM rules WHERE owner_id=u.id AND active) AS active,
        coalesce((SELECT jsonb_agg(t) FROM (
          SELECT mode,count(*)::int AS count FROM usage_ledger
          WHERE owner_id=u.id AND created_at>=date_trunc('month',now())
            AND status IN ('RESERVED','COMPLETED') AND NOT quota_waived GROUP BY mode
        ) t),'[]'::jsonb) AS usage
        FROM users u LEFT JOIN entitlements e ON e.owner_id=u.id AND e.pro_until>now()
        WHERE u.id=$1`, [req.userId, hash(req.cookies.snaap_session ?? "")])
    ).rows[0];
    const isAdmin = isAdminIdentity(user);
    const policy = usagePolicySchema.parse(settings);
    const limits = policy.mode === 'unified' ? policy.unified : policy[pro_until ? 'pro' : 'free'];
    return {
      ...user,
      plan: pro_until ? "PRO" : "FREE",
      proUntil: pro_until ?? null,
      isAdmin,
      impersonating,
      requiresRuleSelection: limits.activeRules !== null && active > limits.activeRules,
      limits: {
        ...limits,
        pairsPerSetup: 10,
      },
      usage,
      local: user?.email === "local@snaap.invalid",
    };
  });
  registerEntryFlexibility(app, db);
  registerRuleDestinations(app, db);
  app.get(
    "/api/v1/rules",
    async (req) =>
      (
        await db.query(
          "SELECT r.*, (r.active AND ($3::int IS NOT NULL AND (SELECT count(*) FROM rules a WHERE a.owner_id=r.owner_id AND a.active AND a.deleted_at IS NULL)>$3)) AS quota_blocked FROM rules r WHERE r.deleted_at IS NULL AND owner_id=$1 AND ($2::uuid IS NULL OR r.workspace_id=$2) ORDER BY created_at DESC",
          [req.userId, req.workspaceId ?? null, (await userLimits(db,req.userId)).activeRules],
        )
      ).rows,
  );
  app.post("/api/v1/rules", async (req, reply) => {
    const input = z
      .union([
        z
          .object({ spec: strategySchema, conversationId: z.string().uuid() })
          .strict(),
        strategySchema,
      ])
      .parse(req.body);
    const conversationId =
      "conversationId" in input ? input.conversationId : undefined;
    const spec = "conversationId" in input ? input.spec : input,
      id = randomUUID();
    if (
      conversationId &&
      !(
        await db.query(
          "SELECT id FROM conversations WHERE id=$1 AND owner_id=$2 AND ($3::uuid IS NULL OR workspace_id=$3)",
          [conversationId, req.userId, req.workspaceId ?? null],
        )
      ).rowCount
    )
      throw new ApiError(404, "NOT_FOUND", "ไม่พบบทสนทนา");
    await transaction(db, async (c) => {
      await c.query(
        "INSERT INTO rules(id,owner_id,spec,workspace_id) VALUES($1,$2,$3,$4)",
        [id, req.userId, spec, req.workspaceId ?? null],
      );
      await c.query(
        "INSERT INTO rule_revisions(rule_id,revision,spec) VALUES($1,1,$2)",
        [id, spec],
      );
      if (conversationId)
        await c.query(
          "UPDATE conversations SET title=$3,saved_rule_id=$4,setup_saved_at=now(),setup_status_known=true WHERE id=$1 AND owner_id=$2",
          [conversationId, req.userId, spec.name, id],
        );
      if (conversationId)
        await c.query(
          "UPDATE messages SET ui_card=jsonb_set(ui_card,'{ruleId}',to_jsonb($2::text)) WHERE id=(SELECT id FROM messages WHERE conversation_id=$1 AND ui_card->>'type' IN ('preset','setup') ORDER BY created_at DESC,id DESC LIMIT 1)",
          [conversationId, id],
        );
    });
    if (conversationId)
      await cleanupChatImages(db, req.userId, conversationId, req.workspaceId);
    return reply.code(201).send({ id, revision: 1, active: false, spec });
  });
  app.put("/api/v1/rules/:id", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const input = z
      .object({
        expectedRevision: z.number().int().positive(),
        spec: strategySchema,
        conversationId: z.string().uuid().optional(),
      })
      .strict()
      .parse(req.body);
    if (
      input.conversationId &&
      !(
        await db.query(
          "SELECT id FROM conversations WHERE id=$1 AND owner_id=$2 AND ($3::uuid IS NULL OR workspace_id=$3)",
          [input.conversationId, req.userId, req.workspaceId ?? null],
        )
      ).rowCount
    )
      throw new ApiError(404, "NOT_FOUND", "ไม่พบบทสนทนา");
    const saved = await transaction(db, async (c) => {
      const result = await c.query(
        "UPDATE rules SET spec=$1,revision=revision+1,active=false,updated_at=now() WHERE id=$2 AND owner_id=$3 AND revision=$4 AND deleted_at IS NULL AND ($5::uuid IS NULL OR workspace_id=$5) RETURNING *",
        [
          input.spec,
          id,
          req.userId,
          input.expectedRevision,
          req.workspaceId ?? null,
        ],
      );
      if (!result.rowCount)
        throw new ApiError(
          409,
          "REVISION_CONFLICT",
          "รายการเปลี่ยนแล้วหรือไม่พบ กรุณาโหลดใหม่",
        );
      const row = result.rows[0];
      await c.query(
        "INSERT INTO rule_revisions(rule_id,revision,spec) VALUES($1,$2,$3)",
        [id, row.revision, row.spec],
      );
      if (input.conversationId)
        await c.query(
          "UPDATE conversations SET title=$3,saved_rule_id=$4,setup_saved_at=now(),setup_status_known=true WHERE id=$1 AND owner_id=$2",
          [input.conversationId, req.userId, input.spec.name, id],
        );
      if (input.conversationId)
        await c.query(
          "UPDATE messages SET ui_card=jsonb_set(ui_card,'{ruleId}',to_jsonb($2::text)) WHERE id=(SELECT id FROM messages WHERE conversation_id=$1 AND ui_card->>'type' IN ('preset','setup') ORDER BY created_at DESC,id DESC LIMIT 1)",
          [input.conversationId, id],
        );
      return row;
    });
    if (input.conversationId)
      await cleanupChatImages(
        db,
        req.userId,
        input.conversationId,
        req.workspaceId,
      );
    return saved;
  });
  app.get("/api/v1/rules/:id/revisions", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    return (
      await db.query(
        "SELECT v.* FROM rule_revisions v JOIN rules r ON r.id=v.rule_id WHERE r.owner_id=$1 AND r.id=$2 AND ($3::uuid IS NULL OR r.workspace_id=$3) ORDER BY v.revision DESC",
        [req.userId, id, req.workspaceId ?? null],
      )
    ).rows;
  });
  app.post("/api/v1/rules/:id/activation", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const input = z
      .object({
        active: z.boolean(),
        expectedRevision: z.number().int().positive(),
        confirmation: z.string(),
      })
      .strict()
      .parse(req.body);
    if (input.active) {
      await assertAccess(db,req.userId,'automation');
      if (!options.monitoring)
        throw new ApiError(409, "MONITOR_NOT_READY", "Worker ยังไม่พร้อม");
      if (input.confirmation !== "ACTIVATE")
        throw new ApiError(400, "CONFIRMATION_REQUIRED", "ยืนยันกฎก่อนเปิดใช้งาน");
      const owned = (
        await db.query(
          "SELECT spec FROM rules WHERE deleted_at IS NULL AND id=$1 AND owner_id=$2 AND revision=$3 AND ($4::uuid IS NULL OR workspace_id=$4)",
          [id, req.userId, input.expectedRevision, req.workspaceId ?? null],
        )
      ).rows[0];
      if (!owned)
        throw new ApiError(409, "REVISION_CONFLICT", "กรุณาโหลดรายการใหม่");
      const spec = strategySchema.parse(owned.spec);
      if (spec.market === "Perpetual Futures" && !spec.side)
        throw new ApiError(
          400,
          "DIRECTION_REQUIRED",
          "เลือก Long, Short หรือทั้งสองฝั่งก่อนเปิดแจ้งเตือน",
        );
      if (options.validateMarket) await options.validateMarket(spec);
      else await validateTargets(spec);
    }
    return transaction(db, async (c) => {
      await c.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
        req.userId,
      ]);
      const rule = (
        await c.query(
          "SELECT * FROM rules WHERE deleted_at IS NULL AND id=$1 AND owner_id=$2 AND revision=$3 AND ($4::uuid IS NULL OR workspace_id=$4) FOR UPDATE",
          [id, req.userId, input.expectedRevision, req.workspaceId ?? null],
        )
      ).rows[0];
      if (!rule)
        throw new ApiError(409, "REVISION_CONFLICT", "กรุณาโหลดรายการใหม่");
      if (input.active) {
        if (!options.monitoring)
          throw new ApiError(409, "MONITOR_NOT_READY", "Worker ยังไม่พร้อม");
        if (input.confirmation !== "ACTIVATE")
          throw new ApiError(
            400,
            "CONFIRMATION_REQUIRED",
            "ยืนยันกฎก่อนเปิดใช้งาน",
          );
        const { activeRules } = await userLimits(c, req.userId);
        if (activeRules !== null) {
          const count = Number((await c.query('SELECT count(*) AS n FROM rules WHERE owner_id=$1 AND active AND id<>$2 AND deleted_at IS NULL',[req.userId,id])).rows[0].n);
          if (count >= activeRules) throw new ApiError(409,'RULE_LIMIT','กฎที่เปิดครบโควตาแล้ว กรุณาเลือกกฎที่จะหยุด');
        }
        const spec = strategySchema.parse(rule.spec);
        const verified = await c.query(
          "SELECT id FROM destinations WHERE owner_id=$1 AND id=ANY($2::uuid[]) AND verified",
          [req.userId, spec.destinations],
        );
        if (verified.rowCount !== spec.destinations.length)
          throw new ApiError(
            400,
            "DESTINATION_UNVERIFIED",
            "ยืนยันช่องทางรับข้อความก่อน",
          );
      }
      if (rule.active === input.active) return rule;
      await c.query("DELETE FROM monitor_checkpoints WHERE rule_id=$1", [id]);
      return (
        await c.query(
          "UPDATE rules SET active=$1,activated_at=CASE WHEN $1 THEN now() ELSE activated_at END WHERE id=$2 RETURNING *",
          [input.active, id],
        )
      ).rows[0];
    });
  });
  app.get(
    "/api/v1/monitor",
    async (req) =>
      (
        await db.query(
          "SELECT s.rule_id,s.exchange,s.pair,s.checked_at,r.spec->>'name' AS setup_name,r.spec->>'market' AS setup_market,r.spec->>'side' AS setup_side,c.state,i.freshness,i.progress,CASE WHEN NOT r.active THEN 'PAUSED' WHEN ($3::int IS NOT NULL AND (SELECT count(*) FROM rules a WHERE a.owner_id=r.owner_id AND a.active AND a.deleted_at IS NULL)>$3) THEN 'QUOTA_BLOCKED' WHEN s.status='READY' AND i.rule_id IS NULL THEN 'RECOVERING' ELSE s.status END AS status FROM monitor_status s JOIN rules r ON r.id=s.rule_id LEFT JOIN monitor_insights i ON i.rule_id=s.rule_id AND i.exchange=s.exchange AND i.pair=s.pair AND i.revision=r.revision LEFT JOIN monitor_checkpoints c ON c.rule_id=s.rule_id AND c.revision=r.revision AND c.exchange=s.exchange AND c.pair=s.pair WHERE r.deleted_at IS NULL AND r.owner_id=$1 AND ($2::uuid IS NULL OR r.workspace_id=$2) ORDER BY s.exchange,s.pair,r.id",
          [req.userId, req.workspaceId ?? null, (await userLimits(db,req.userId)).activeRules],
        )
      ).rows,
  );
  app.put("/api/v1/conversations/:id/draft", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const input = z
      .object({
        spec: strategySchema,
        expectedRevision: z.number().int().nonnegative(),
      })
      .strict()
      .parse(req.body);
    const row = (
      await db.query(
        "UPDATE conversations SET draft=$1,draft_revision=draft_revision+1 WHERE id=$2 AND owner_id=$3 AND draft_revision=$4 AND ($5::uuid IS NULL OR workspace_id=$5) RETURNING draft_revision",
        [
          input.spec,
          id,
          req.userId,
          input.expectedRevision,
          req.workspaceId ?? null,
        ],
      )
    ).rows[0];
    if (!row)
      throw new ApiError(
        409,
        "REVISION_CONFLICT",
        "ร่างเปลี่ยนแล้ว กรุณาเปิดบทสนทนาใหม่",
      );
    return row;
  });
  app.get(
    "/api/v1/conversations",
    async (req, reply) => {
      const {view} = z.object({view: z.literal('summary').optional()}).parse(req.query);
      const fields = view === 'summary'
        ? 'c.id,c.created_at,c.workspace_id,c.setup_saved_at,c.setup_status_known,c.saved_rule_id,c.draft_revision'
        : 'c.*';
      const started = performance.now();
      const result = await db.query(
          `SELECT ${fields},EXISTS(SELECT 1 FROM messages m WHERE m.conversation_id=c.id) AS has_messages,CASE WHEN c.setup_saved_at IS NOT NULL AND c.title IN ('เซตอัพใหม่','เซตอัปใหม่','เซ็ตอัพใหม่') THEN COALESCE(NULLIF(btrim(c.draft->>'name'),''),c.title) ELSE c.title END AS title FROM conversations c WHERE owner_id=$1 AND ($2::uuid IS NULL OR workspace_id=$2) ORDER BY c.created_at DESC,c.id DESC LIMIT 100`,
          [req.userId, req.workspaceId ?? null],
      );
      reply.header('Server-Timing', `db;dur=${(performance.now() - started).toFixed(1)}`);
      return result.rows;
    },
  );
  registerConversationRemoval(app, db);
  app.get('/api/v1/conversations/:id', async (req, reply) => {
    const {id} = z.object({id: z.string().uuid()}).parse(req.params);
    const started = performance.now();
    const row = (await db.query(
      "SELECT c.*,CASE WHEN c.setup_saved_at IS NOT NULL AND c.title IN ('เซตอัพใหม่','เซตอัปใหม่','เซ็ตอัพใหม่') THEN COALESCE(NULLIF(btrim(c.draft->>'name'),''),c.title) ELSE c.title END AS title FROM conversations c WHERE c.id=$1 AND owner_id=$2 AND ($3::uuid IS NULL OR workspace_id=$3)",
      [id, req.userId, req.workspaceId ?? null],
    )).rows[0];
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'ไม่พบบทสนทนา');
    reply.header('Server-Timing', `db;dur=${(performance.now() - started).toFixed(1)}`);
    return row;
  });
  app.post("/api/v1/conversations", async (req, reply) => {
    const { title } = z
      .object({ title: z.string().trim().min(1).max(100) })
      .strict()
      .parse(req.body);
    const id = randomUUID();
    await db.query(
      "INSERT INTO conversations(id,owner_id,title,workspace_id) VALUES($1,$2,$3,$4)",
      [id, req.userId, title, req.workspaceId ?? null],
    );
    return reply
      .code(201)
      .send({ id, title, workspace_id: req.workspaceId ?? null });
  });
  app.put("/api/v1/conversations/:id/title", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { title } = z.object({ title: z.string().trim().min(1).max(100) }).strict().parse(req.body);
    const row = (await db.query(
      "UPDATE conversations SET title=$1 WHERE id=$2 AND owner_id=$3 AND ($4::uuid IS NULL OR workspace_id=$4) RETURNING id,title",
      [title, id, req.userId, req.workspaceId ?? null],
    )).rows[0];
    if (!row) throw new ApiError(404, "NOT_FOUND", "ไม่พบบทสนทนา");
    return row;
  });
  app.get("/api/v1/conversations/:id/messages", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { before } = z
      .object({ before: z.string().uuid().optional() })
      .parse(req.query);
    const valid = await sourceIds(db, req.userId, req.workspaceId);
    return (
      await db.query(
        "SELECT m.* FROM messages m JOIN conversations c ON m.conversation_id=c.id WHERE c.id=$1 AND c.owner_id=$2 AND ($4::uuid IS NULL OR c.workspace_id=$4) AND ($3::uuid IS NULL OR (m.created_at,m.id)<(SELECT created_at,id FROM messages WHERE id=$3 AND conversation_id=$1)) ORDER BY m.created_at DESC,m.id DESC LIMIT 200",
        [id, req.userId, before ?? null, req.workspaceId ?? null],
      )
    ).rows
      .reverse()
      .map((m) => ({
        ...m,
        sources: m.sources.map((s: any) => ({
          ...s,
          available: valid.has(s.id),
        })),
      }));
  });
  // Match inbox visibility, including the recorded revision's validity deadline.
  const inboxScope = `s.owner_id=$1 AND ($2::uuid IS NULL OR s.rule_id IN
    (SELECT id FROM rules WHERE owner_id=$1 AND workspace_id=$2))
    AND s.event->>'kind' IS DISTINCT FROM 'EXPIRED'`;
  const deadlineSql = `CASE WHEN jsonb_typeof(s.event->'time')='number'
    THEN (s.event->>'time')::numeric + ($3::jsonb->>(rv.spec->>'timeframe'))::numeric END`;
  app.get('/api/v1/signals/unread', async req => {
    const result = await db.query(`WITH unread AS (
      SELECT s.id,s.created_at FROM signals s LEFT JOIN rule_revisions rv
      ON rv.rule_id=s.rule_id AND rv.revision=s.revision
      WHERE ${inboxScope} AND s.read_at IS NULL AND
      (s.event->>'kind' NOT IN ('ENTRY','EXIT') OR
        (${deadlineSql}>0 AND ${deadlineSql}<=9007199254740991 AND
         ${deadlineSql}=trunc(${deadlineSql})))
    ) SELECT count(*)::int AS count,
      (SELECT id FROM unread ORDER BY created_at DESC,id DESC LIMIT 1) AS "latestId" FROM unread`,
      [req.userId, req.workspaceId ?? null, JSON.stringify(frames)]);
    return result.rows[0];
  });
  app.post('/api/v1/signals/read', async req => {
    const {through} = z.object({through: z.string().uuid()}).strict().parse(req.body);
    // A snapshot cursor protects signals that arrive while the read request is in flight.
    await db.query(`UPDATE signals s SET read_at=now() WHERE ${inboxScope}
      AND s.read_at IS NULL AND (s.created_at,s.id)<=(SELECT created_at,id
        FROM signals WHERE id=$3 AND owner_id=$1 AND
        ($2::uuid IS NULL OR rule_id IN (SELECT id FROM rules WHERE owner_id=$1 AND workspace_id=$2)))`,
      [req.userId, req.workspaceId ?? null, through]);
    return {ok: true};
  });
  app.get("/api/v1/signals", async (req) => {
    const { before, after, view } = z
      .object({
        before: z.string().uuid().optional(),
        after: z.string().uuid().optional(),
        view: z.enum(['signals','status']).optional(),
      })
      .refine((value) => !(value.before && value.after), "Choose one cursor")
      .parse(req.query);
    return (
      await db.query(
        `SELECT s.*,rv.spec->>'name' AS setup_name,rv.spec->>'market' AS setup_market,rv.spec->>'side' AS setup_side,rv.spec->>'timeframe' AS setup_timeframe FROM signals s LEFT JOIN rule_revisions rv ON rv.rule_id=s.rule_id AND rv.revision=s.revision WHERE s.owner_id=$1 AND ($3::uuid IS NULL OR s.rule_id IN (SELECT id FROM rules WHERE owner_id=$1 AND workspace_id=$3)) AND ($2::uuid IS NULL OR (s.created_at,s.id)<(SELECT created_at,id FROM signals WHERE id=$2 AND owner_id=$1)) AND ($4::uuid IS NULL OR (s.created_at,s.id)>(SELECT created_at,id FROM signals WHERE id=$4 AND owner_id=$1)) AND ($5::text IS NULL OR ($5='status' AND s.event->>'kind'='EXPIRED') OR ($5='signals' AND s.event->>'kind' IS DISTINCT FROM 'EXPIRED')) ORDER BY s.created_at ${after ? "ASC" : "DESC"},s.id ${after ? "ASC" : "DESC"} LIMIT 100`,
        [req.userId, before ?? null, req.workspaceId ?? null, after ?? null, view ?? null],
      )
    ).rows.map(({ setup_timeframe, ...row }) => ({
      ...row,
      signal_valid_until: signalValidUntil(row.event, setup_timeframe),
      entry_valid_until: row.event.kind === "ENTRY" ? signalValidUntil(row.event, setup_timeframe) : null,
    }));
  });
  app.get("/api/v1/export", async (req) => ({
    rules: (
      await db.query(
        "SELECT spec,revision,active FROM rules WHERE deleted_at IS NULL AND owner_id=$1",
        [req.userId],
      )
    ).rows,
    imports: (
      await db.query(
        "SELECT name,rows,created_at FROM imports WHERE owner_id=$1",
        [req.userId],
      )
    ).rows,
    signals: (
      await db.query(
        "SELECT event,exchange,pair,created_at FROM signals WHERE owner_id=$1",
        [req.userId],
      )
    ).rows,
  }));
  registerSetupFiles(app, db);
  registerSetupShares(app, db);
  registerPresets(app, db, { instruments: options.presetInstruments });
  registerRuleRemoval(app, db);
  await app.register(staticFiles, {
    root: path.resolve("dist"),
    index: "landing.html",
  });
  // Explicit SPA routes keep direct links and refreshes working without hiding
  // missing assets or unknown API endpoints behind the app shell.
  for (const view of ["home", "notifications", "history", "watch", "billing"]) {
    app.get(`/${view}`, async (_req, reply) => reply.sendFile("index.html"));
    app.get(`/${view}/`, async (req, reply) =>
      reply.redirect(`/${view}${req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : ""}`),
    );
  }
  app.get("/admin", async (_req, reply) => reply.sendFile("admin.html"));
  app.get("/admin/login", async (_req, reply) =>
    reply.sendFile("admin-login.html"),
  );
  app.get("/admin/", async (_req, reply) => reply.redirect("/admin"));
  return { app, session, origin };
}
