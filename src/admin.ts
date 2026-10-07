import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type pg from "pg";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ApiError } from "./errors.js";
import { transaction } from "./data/db.js";
import { registerAdminEvents, auditAdmin } from "./admin-events.js";
import { hash } from "./crypto.js";
import { ADMIN_EMAIL, isAdminIdentity } from "./admin-access.js";
import { usagePolicy, usagePolicySchema } from './usage-policy.js';
import { registerAdminUsage } from './admin-usage.js';
import { registerAccessControls } from './access-controls.js';

export interface SystemLogEntry {
  id: string;
  timestamp: string;
  type: string;
  message: string;
  statusCode?: number;
  detail?: any;
  url?: string;
  method?: string;
  userId?: string;
}

const logBuffer: SystemLogEntry[] = [];
const MAX_LOGS = 100;

export function recordSystemLog(
  entry: Omit<SystemLogEntry, "id" | "timestamp">,
) {
  logBuffer.unshift({
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    ...entry,
  });
  if (logBuffer.length > MAX_LOGS) logBuffer.pop();
}

export function getSystemLogs(): SystemLogEntry[] {
  return [...logBuffer];
}

export function clearSystemLogs(): void {
  logBuffer.length = 0;
}

export async function isUserAdmin(
  db: pg.Pool,
  userId: string,
  local = false,
): Promise<{ isAdmin: boolean; user?: any }> {
  try {
    const result = await db.query(
      "SELECT id, email, google_sub, role, created_at FROM users WHERE id=$1",
      [userId],
    );
    if (!result.rowCount) return { isAdmin: false };
    const user = result.rows[0];
    return { isAdmin: isAdminIdentity(user), user };
  } catch {
    return { isAdmin: false };
  }
}

export function registerAdmin(
  app: FastifyInstance,
  db: pg.Pool,
  options: {
    local?: boolean;
    monitoring?: boolean;
    session: (
      id: string,
      reply: FastifyReply,
      lifetimeSeconds?: number,
    ) => Promise<string>;
  },
) {
  // Pre-handler hook to authenticate admin access for all /api/v1/admin/* routes
  app.addHook("preHandler", async (req: FastifyRequest) => {
    if (req.routeOptions.url?.startsWith("/api/v1/admin")) {
      if (!req.userId) {
        throw new ApiError(401, "UNAUTHENTICATED", "กรุณาเข้าสู่ระบบ");
      }
      const { isAdmin } = await isUserAdmin(db, req.userId, options.local);
      if (!isAdmin) {
        throw new ApiError(
          403,
          "ADMIN_REQUIRED",
          "จำเป็นต้องมีสิทธิ์ผู้ดูแลระบบ (Admin)",
        );
      }
    }
  });

  app.get('/api/v1/admin/usage-policy', async () => usagePolicy(db));
  registerAdminUsage(app, db);
  registerAccessControls(app, db);
  app.post('/api/v1/admin/usage-policy', async req => {
    const input = z.object({policy: usagePolicySchema, expectedRevision: z.number().int().nonnegative()}).strict().parse(req.body);
    return transaction(db, async c => {
      const before = await usagePolicy(c);
      const updated = await c.query('UPDATE usage_policy SET policy=$1,revision=revision+1,updated_at=now() WHERE id=1 AND revision=$2 RETURNING revision', [input.policy, input.expectedRevision]);
      if (!updated.rowCount) throw new ApiError(409, 'REVISION_CONFLICT', 'การตั้งค่าถูกเปลี่ยนแล้ว กรุณาโหลดใหม่ก่อนบันทึก');
      await c.query("UPDATE deliveries SET usage_retry_at=NULL WHERE status IN ('USAGE_LIMIT','ADMIN_PAUSED')");
      await auditAdmin(c, req.userId, 'usage-policy.update', undefined, {before, after: input.policy});
      return {...input.policy, revision: updated.rows[0].revision};
    });
  });
  // Overview & Diagnostics
  app.post("/api/v1/impersonation/restore", async (req, reply) => {
    const sessionHash = hash(req.cookies.snaap_session ?? "");
    const actor = (
      await db.query(
        "SELECT actor_id FROM admin_impersonations WHERE session_hash=$1",
        [sessionHash],
      )
    ).rows[0];
    if (
      !actor ||
      !(await isUserAdmin(db, actor.actor_id, options.local)).isAdmin
    )
      throw new ApiError(
        403,
        "ADMIN_REQUIRED",
        "ไม่พบเซสชันผู้ดูแลที่กลับไปได้",
      );
    await options.session(actor.actor_id, reply);
    await db.query("DELETE FROM sessions WHERE token_hash=$1", [sessionHash]);
    await auditAdmin(db, actor.actor_id, "user.impersonate.end", req.userId);
    return { ok: true };
  });
  app.get("/api/v1/admin/overview", async () => {
    const start = Date.now();
    let dbPing = 0;
    try {
      await db.query("SELECT 1");
      dbPing = Date.now() - start;
    } catch {
      dbPing = -1;
    }

    const [
      usersCountRes,
      proCountRes,
      adminCountRes,
      rulesRes,
      activeRulesRes,
      signals24hRes,
      deliveries24hRes,
      aiMonthRes,
      recentDeliveriesRes,
      monitorIssuesRes,
      recentAiRunsRes,
      heartbeatRes,
    ] = await Promise.all([
      db.query("SELECT count(*)::int AS n FROM users"),
      db.query(
        "SELECT count(*)::int AS n FROM entitlements WHERE pro_until > now()",
      ),
      db.query(
        "SELECT count(*)::int AS n FROM users WHERE google_sub IS NOT NULL AND lower(email)=$1",
        [ADMIN_EMAIL],
      ),
      db.query("SELECT count(*)::int AS n FROM rules WHERE deleted_at IS NULL"),
      db.query(
        "SELECT count(*)::int AS n FROM rules WHERE active AND deleted_at IS NULL",
      ),
      db.query(
        "SELECT count(*)::int AS n FROM signals WHERE created_at >= now() - interval '24 hours'",
      ),
      db.query(
        "SELECT status, count(*)::int AS count FROM deliveries WHERE signal_id IN (SELECT id FROM signals WHERE created_at >= now() - interval '24 hours') GROUP BY status",
      ),
      db.query(
        "SELECT mode,count(*) FILTER(WHERE status IN ('RESERVED','COMPLETED'))::int AS count,sum(COALESCE(estimated_usd,0)) AS estimated_usd FROM usage_ledger WHERE created_at>=date_trunc('month',now()) GROUP BY mode",
      ),
      db.query(
        "SELECT d.id, d.status, d.attempts, d.detail, dest.kind, dest.name as destination_name, s.pair, s.exchange, s.created_at FROM deliveries d JOIN destinations dest ON dest.id=d.destination_id JOIN signals s ON s.id=d.signal_id ORDER BY s.created_at DESC LIMIT 10",
      ),
      db.query(
        "SELECT ms.rule_id, ms.exchange, ms.pair, ms.status, ms.checked_at, r.spec->>'name' as rule_name, u.email as owner_email FROM monitor_status ms JOIN rules r ON r.id = ms.rule_id JOIN users u ON u.id = r.owner_id WHERE ms.status != 'READY' AND r.active AND r.deleted_at IS NULL ORDER BY ms.checked_at DESC LIMIT 10",
      ),
      db.query(
        "SELECT ar.id, ar.conversation_id, ar.status, ar.created_at, u.email as owner_email FROM agent_runs ar JOIN users u ON u.id = ar.owner_id ORDER BY ar.created_at DESC LIMIT 10",
      ),
      db.query(
        "SELECT checked_at FROM service_heartbeats WHERE service='monitor'",
      ),
    ]);

    const deliveryMap: Record<string, number> = {};
    for (const row of deliveries24hRes.rows) {
      deliveryMap[row.status] = row.count;
    }

    const aiMap: Record<string, number> = {};
    for (const row of aiMonthRes.rows) {
      aiMap[row.mode] = row.count;
    }

    return {
      health: {
        database: {
          status: dbPing >= 0 ? "healthy" : "error",
          latencyMs: dbPing,
        },
        monitor: {
          enabled: !!options.monitoring,
          checkedAt: heartbeatRes.rows[0]?.checked_at ?? null,
          status: !options.monitoring
            ? "disabled"
            : heartbeatRes.rows[0] &&
                Date.now() -
                  new Date(heartbeatRes.rows[0].checked_at).getTime() <
                  180000
              ? "healthy"
              : "error",
        },
        uptimeSeconds: Math.floor(process.uptime()),
        memoryMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        ai: {
          configured: !!process.env.AI_API_KEY,
          standardModel: process.env.AI_STANDARD_MODEL || "gpt-5-mini",
          deepModel: process.env.AI_DEEP_MODEL || "gpt-5.4",
        },
        billing: {
          configured: !!process.env.STRIPE_SECRET_KEY,
          liveEnabled: process.env.BILLING_LIVE_ENABLED === "true",
        },
        google: {
          configured: !!(
            process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
          ),
        },
        telegram: {
          configured: !!process.env.TELEGRAM_BOT_TOKEN,
          botUsername: process.env.TELEGRAM_BOT_USERNAME || null,
        },
        line: {
          configured: !!process.env.LINE_CHANNEL_SECRET,
        },
      },
      kpis: {
        totalUsers: usersCountRes.rows[0]?.n ?? 0,
        proUsers: proCountRes.rows[0]?.n ?? 0,
        adminUsers: adminCountRes.rows[0]?.n ?? 0,
        totalRules: rulesRes.rows[0]?.n ?? 0,
        activeRules: activeRulesRes.rows[0]?.n ?? 0,
        signals24h: signals24hRes.rows[0]?.n ?? 0,
        deliveries24h: {
          total: Object.values(deliveryMap).reduce((a, b) => a + b, 0),
          delivered: (deliveryMap["DELIVERED"] ?? 0) + (deliveryMap["SENT"] ?? 0),
          failed:
            (deliveryMap["FAILED"] ?? 0) + (deliveryMap["AMBIGUOUS"] ?? 0),
          retry: deliveryMap["RETRY"] ?? 0,
          pending: deliveryMap["PENDING"] ?? 0,
        },
        aiCallsMonth: {
          estimatedUsd: aiMonthRes.rows.reduce(
            (sum, row) => sum + Number(row.estimated_usd ?? 0),
            0,
          ),
          standard: aiMap["standard"] ?? 0,
          deep: aiMap["deep"] ?? 0,
          total: (aiMap["standard"] ?? 0) + (aiMap["deep"] ?? 0),
        },
      },
      recentDeliveries: recentDeliveriesRes.rows,
      monitorIssues: monitorIssuesRes.rows,
      recentAiRuns: recentAiRunsRes.rows,
    };
  });

  // Users List
  app.get("/api/v1/admin/users", async (req) => {
    const q = z
      .object({
        search: z.string().max(200).default(""),
        filter: z.enum(["all", "pro", "free", "admin"]).default("all"),
        before: z.string().uuid().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      })
      .strict()
      .parse(req.query);
    const adminEmails = [ADMIN_EMAIL];

    const result = await db.query(
      `
      WITH listed AS (SELECT
        u.id, 
        u.email, 
        u.role, u.google_sub,
        ur.scope AS restriction_scope, ur.until_at AS restriction_until,
        (ur.scope<>'none' AND (ur.until_at IS NULL OR ur.until_at>now())) AS restriction_active,
        u.created_at,
        (u.google_sub IS NOT NULL AND COALESCE(lower(u.email)=ANY($1::text[]),false)) AS is_admin,
        e.pro_until,
        (e.pro_until IS NOT NULL AND e.pro_until > now()) AS is_pro,
        (SELECT count(*)::int FROM rules r WHERE r.owner_id = u.id AND r.deleted_at IS NULL) AS rules_count,
        (SELECT count(*)::int FROM rules r WHERE r.owner_id = u.id AND r.active AND r.deleted_at IS NULL) AS active_rules_count,
        (SELECT count(*)::int FROM signals s WHERE s.owner_id = u.id AND s.event->>'kind' IS DISTINCT FROM 'EXPIRED') AS signals_count,
        (SELECT count(*)::int FROM usage_ledger ul WHERE ul.owner_id = u.id AND ul.mode = 'standard' AND ul.created_at >= date_trunc('month', now()) AND ul.status='COMPLETED') AS ai_standard_used,
        (SELECT count(*)::int FROM usage_ledger ul WHERE ul.owner_id = u.id AND ul.mode = 'deep' AND ul.created_at >= date_trunc('month', now()) AND ul.status='COMPLETED') AS ai_deep_used,
        (SELECT count(*)::int FROM workspaces w WHERE w.owner_id=u.id) AS workspaces_count,
        (SELECT count(*)::int FROM deliveries d JOIN signals s ON s.id=d.signal_id WHERE s.owner_id=u.id AND d.status IN ('SENT','DELIVERED')) AS notifications_sent,
        (SELECT count(*)::int FROM notification_quota nq WHERE nq.owner_id=u.id AND nq.month=to_char(now() AT TIME ZONE 'Asia/Bangkok','YYYY-MM')) AS line_used_month,
        (SELECT COALESCE(sum(input_tokens),0)::bigint FROM usage_ledger ul WHERE ul.owner_id=u.id AND ul.created_at>=date_trunc('month',now())) AS ai_input_tokens,
        (SELECT COALESCE(sum(output_tokens),0)::bigint FROM usage_ledger ul WHERE ul.owner_id=u.id AND ul.created_at>=date_trunc('month',now())) AS ai_output_tokens,
        (SELECT COALESCE(sum(estimated_usd),0) FROM usage_ledger ul WHERE ul.owner_id=u.id AND ul.created_at>=date_trunc('month',now())) AS ai_estimated_usd,
        (SELECT count(*)::int FROM usage_ledger ul WHERE ul.owner_id=u.id AND ul.status='REFUNDED' AND ul.created_at>=date_trunc('month',now())) AS ai_failed_count
      FROM users u
      LEFT JOIN entitlements e ON e.owner_id = u.id
      LEFT JOIN user_restrictions ur ON ur.owner_id=u.id
      WHERE ($2='' OR position(lower($2) IN lower(COALESCE(u.email,'')))>0 OR position(lower($2) IN u.id::text)>0)
      AND ($3::uuid IS NULL OR (u.created_at,u.id)<(SELECT created_at,id FROM users WHERE id=$3)))
      SELECT * FROM listed WHERE $4='all' OR ($4='pro' AND is_pro) OR ($4='free' AND NOT is_pro AND NOT is_admin) OR ($4='admin' AND is_admin)
      ORDER BY created_at DESC,id DESC LIMIT $5
    `,
      [adminEmails, q.search, q.before ?? null, q.filter, q.limit + 1],
    );

    return {
      nextCursor:
        result.rows.length > q.limit ? result.rows[q.limit - 1].id : null,
      policy: await usagePolicy(db),
      users: result.rows.slice(0, q.limit).map((row) => ({
        ...row,
        isAdmin: isAdminIdentity(row),
      })),
    };
  });

  // Change User Plan or Role
  app.post("/api/v1/admin/users/:userId/plan", async (req) => {
    const { userId } = z
      .object({ userId: z.string().uuid() })
      .parse(req.params);
    const body = z
      .object({
        plan: z.enum(["free", "pro_30d", "pro_1y", "pro_lifetime"]).optional(),
        role: z.enum(["user", "admin"]).optional(),
      })
      .strict()
      .refine(
        (body) => !!(body.plan || body.role),
        "ระบุแพ็กเกจหรือสิทธิ์ที่ต้องการเปลี่ยน",
      )
      .parse(req.body);
    if (body.role)
      throw new ApiError(
        409,
        "ADMIN_ALLOWLIST_LOCKED",
        "สิทธิ์ผู้ดูแลจำกัดเฉพาะบัญชีที่อนุญาต ไม่สามารถเพิ่มหรือถอนผ่าน Dashboard",
      );

    const updated = await transaction(db, async (c) => {
      const userExists = (
        await c.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [userId])
      ).rowCount;
      if (!userExists) {
        throw new ApiError(404, "USER_NOT_FOUND", "ไม่พบผู้ใช้ที่ระบุ");
      }

      if (body.plan) {
        if (body.plan === "free") {
          await c.query(
            "INSERT INTO entitlements(owner_id, pro_until) VALUES($1, now()) ON CONFLICT(owner_id) DO UPDATE SET pro_until=now()",
            [userId],
          );
        } else if (body.plan === "pro_30d") {
          await c.query(
            "INSERT INTO entitlements(owner_id, pro_until) VALUES($1, now() + interval '30 days') ON CONFLICT(owner_id) DO UPDATE SET pro_until=GREATEST(COALESCE(entitlements.pro_until, now()), EXCLUDED.pro_until)",
            [userId],
          );
        } else if (body.plan === "pro_1y") {
          await c.query(
            "INSERT INTO entitlements(owner_id, pro_until) VALUES($1, now() + interval '1 year') ON CONFLICT(owner_id) DO UPDATE SET pro_until=GREATEST(COALESCE(entitlements.pro_until, now()), EXCLUDED.pro_until)",
            [userId],
          );
        } else if (body.plan === "pro_lifetime") {
          await c.query(
            "INSERT INTO entitlements(owner_id, pro_until) VALUES($1, '2099-12-31 23:59:59+00') ON CONFLICT(owner_id) DO UPDATE SET pro_until=EXCLUDED.pro_until",
            [userId],
          );
        }
      }

      if (body.plan) {
        await c.query(
          "INSERT INTO manual_entitlements(owner_id,pro_until) VALUES($1,CASE $2 WHEN 'free' THEN NULL WHEN 'pro_30d' THEN now()+interval '30 days' WHEN 'pro_1y' THEN now()+interval '1 year' ELSE '2099-12-31 23:59:59+00'::timestamptz END) ON CONFLICT(owner_id) DO UPDATE SET pro_until=excluded.pro_until",
          [userId, body.plan],
        );
      }
      const updated = (
        await c.query(
          "SELECT u.id, u.email, u.role, e.pro_until FROM users u LEFT JOIN entitlements e ON e.owner_id=u.id WHERE u.id=$1",
          [userId],
        )
      ).rows[0];

      await auditAdmin(c, req.userId, "user.update", userId, body);
      return updated;
    });

    return {
      ok: true,
      user: {
        ...updated,
        isPro: updated.pro_until
          ? new Date(updated.pro_until) > new Date()
          : false,
      },
    };
  });

  // Reset User Monthly AI Quota
  app.post("/api/v1/admin/users/:userId/reset-quota", async (req) => {
    const { userId } = z
      .object({ userId: z.string().uuid() })
      .parse(req.params);
    const resetRecords = await transaction(db, async (c) => {
      if (
        !(
          await c.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [userId])
        ).rowCount
      )
        throw new ApiError(404, "USER_NOT_FOUND", "ไม่พบผู้ใช้");
      if (
        (
          await c.query(
            "SELECT 1 FROM agent_runs WHERE owner_id=$1 AND status='RUNNING' AND created_at>now()-interval '5 minutes'",
            [userId],
          )
        ).rowCount
      )
        throw new ApiError(
          409,
          "AGENT_BUSY",
          "รอการวิเคราะห์ที่กำลังทำงานก่อนรีเซ็ตโควตา",
        );
      await auditAdmin(c, req.userId, "quota.reset", userId);
      return (
        await c.query(
          "UPDATE usage_ledger SET quota_waived=true WHERE owner_id=$1 AND created_at>=date_trunc('month',now()) AND status='COMPLETED' AND NOT quota_waived",
          [userId],
        )
      ).rowCount;
    });
    return {
      ok: true,
      userId,
      resetRecords,
      deletedRecords: 0,
      message: "รีเซ็ตโควตาการใช้งาน AI ประจำเดือนเรียบร้อยแล้ว",
    };
  });

  // Impersonate User
  app.post("/api/v1/admin/users/:userId/impersonate", async (req, reply) => {
    const { userId } = z
      .object({ userId: z.string().uuid() })
      .parse(req.params);
    const user = (
      await db.query("SELECT id, email FROM users WHERE id=$1", [userId])
    ).rows[0];
    if (!user) {
      throw new ApiError(404, "USER_NOT_FOUND", "ไม่พบผู้ใช้");
    }
    if ((await isUserAdmin(db, userId, options.local)).isAdmin)
      throw new ApiError(
        409,
        "ADMIN_IMPERSONATION",
        "ใช้การสวมบัญชีเฉพาะผู้ใช้ทั่วไป",
      );
    await auditAdmin(db, req.userId, "user.impersonate", userId);
    const token = await options.session(userId, reply, 900);
    await db.query(
      "INSERT INTO admin_impersonations(session_hash,actor_id) VALUES($1,$2)",
      [hash(token), req.userId],
    );
    return {
      ok: true,
      impersonated: { id: user.id, email: user.email },
      message: `เข้าสู่ระบบเสมือน ${user.email || user.id} เรียบร้อยแล้ว`,
    };
  });

  // Detailed Diagnostics
  app.get("/api/v1/admin/diagnostics", async () => {
    const [failedDeliveries, marketIssues] = await Promise.all([
      db.query(
        "SELECT d.id, d.status, d.attempts, d.detail, dest.kind, dest.name as destination_name, s.pair, s.exchange, s.created_at FROM deliveries d JOIN destinations dest ON dest.id=d.destination_id JOIN signals s ON s.id=d.signal_id WHERE d.status IN ('FAILED', 'RETRY', 'AMBIGUOUS') ORDER BY s.created_at DESC LIMIT 50",
      ),
      db.query(
        "SELECT ms.rule_id, ms.exchange, ms.pair, ms.status, ms.checked_at, r.spec->>'name' as rule_name, u.email as owner_email FROM monitor_status ms JOIN rules r ON r.id = ms.rule_id JOIN users u ON u.id = r.owner_id WHERE ms.status != 'READY' AND r.active AND r.deleted_at IS NULL ORDER BY ms.checked_at DESC LIMIT 50",
      ),
    ]);

    return {
      failedDeliveries: failedDeliveries.rows,
      marketIssues: marketIssues.rows,
      recentLogs: getSystemLogs(),
    };
  });

  // Error Logs API
  app.get("/api/v1/admin/logs", async () => {
    return {
      logs: getSystemLogs(),
    };
  });
  app.post("/api/v1/admin/logs/clear", async (req) => {
    await auditAdmin(db, req.userId, "logs.clear");
    clearSystemLogs();
    return { ok: true };
  });

  registerAdminEvents(app, db, !!options.monitoring);
}
