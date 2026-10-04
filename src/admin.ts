import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type pg from "pg";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ApiError } from "./errors.js";

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
      "SELECT id, email, role, created_at FROM users WHERE id=$1",
      [userId],
    );
    if (!result.rowCount) return { isAdmin: false };
    const user = result.rows[0];
    if (user.role === "admin") return { isAdmin: true, user };
    if (
      local &&
      (user.email === "local@snaap.invalid" ||
        user.id === "00000000-0000-4000-8000-000000000001")
    ) {
      return { isAdmin: true, user };
    }
    const adminEmails = (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (user.email && adminEmails.includes(user.email.toLowerCase())) {
      return { isAdmin: true, user };
    }
    return { isAdmin: false, user };
  } catch {
    return { isAdmin: false };
  }
}

export function registerAdmin(
  app: FastifyInstance,
  db: pg.Pool,
  options: {
    local?: boolean;
    session: (id: string, reply: FastifyReply) => Promise<void>;
  },
) {
  // Pre-handler hook to authenticate admin access for all /api/v1/admin/* routes
  app.addHook("preHandler", async (req: FastifyRequest) => {
    if (req.url.startsWith("/api/v1/admin")) {
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

  // Overview & Diagnostics
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
    ] = await Promise.all([
      db.query("SELECT count(*)::int AS n FROM users"),
      db.query(
        "SELECT count(*)::int AS n FROM entitlements WHERE pro_until > now()",
      ),
      db.query("SELECT count(*)::int AS n FROM users WHERE role = 'admin'"),
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
        "SELECT mode, count(*)::int AS count FROM usage_ledger WHERE created_at >= date_trunc('month', now()) AND status IN ('RESERVED','COMPLETED') GROUP BY mode",
      ),
      db.query(
        "SELECT d.id, d.status, d.attempts, d.detail, dest.kind, dest.name as destination_name, s.pair, s.exchange, s.created_at FROM deliveries d JOIN destinations dest ON dest.id=d.destination_id JOIN signals s ON s.id=d.signal_id ORDER BY s.created_at DESC LIMIT 10",
      ),
      db.query(
        "SELECT ms.rule_id, ms.exchange, ms.pair, ms.status, ms.checked_at, r.name as rule_name, u.email as owner_email FROM monitor_status ms JOIN rules r ON r.id = ms.rule_id JOIN users u ON u.id = r.owner_id WHERE ms.status != 'HEALTHY' ORDER BY ms.checked_at DESC LIMIT 10",
      ),
      db.query(
        "SELECT ar.id, ar.conversation_id, ar.status, ar.created_at, u.email as owner_email FROM agent_runs ar JOIN users u ON u.id = ar.owner_id ORDER BY ar.created_at DESC LIMIT 10",
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
        database: { status: dbPing >= 0 ? "healthy" : "error", latencyMs: dbPing },
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
          delivered: deliveryMap["DELIVERED"] ?? 0,
          failed: (deliveryMap["FAILED"] ?? 0) + (deliveryMap["AMBIGUOUS"] ?? 0),
          retry: deliveryMap["RETRY"] ?? 0,
          pending: deliveryMap["PENDING"] ?? 0,
        },
        aiCallsMonth: {
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
  app.get("/api/v1/admin/users", async () => {
    const adminEmails = (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    const result = await db.query(`
      SELECT 
        u.id, 
        u.email, 
        u.role, 
        u.created_at,
        e.pro_until,
        (e.pro_until IS NOT NULL AND e.pro_until > now()) AS is_pro,
        (SELECT count(*)::int FROM rules r WHERE r.owner_id = u.id AND r.deleted_at IS NULL) AS rules_count,
        (SELECT count(*)::int FROM rules r WHERE r.owner_id = u.id AND r.active AND r.deleted_at IS NULL) AS active_rules_count,
        (SELECT count(*)::int FROM signals s WHERE s.owner_id = u.id) AS signals_count,
        (SELECT count(*)::int FROM usage_ledger ul WHERE ul.owner_id = u.id AND ul.mode = 'standard' AND ul.created_at >= date_trunc('month', now()) AND ul.status IN ('RESERVED','COMPLETED')) AS ai_standard_used,
        (SELECT count(*)::int FROM usage_ledger ul WHERE ul.owner_id = u.id AND ul.mode = 'deep' AND ul.created_at >= date_trunc('month', now()) AND ul.status IN ('RESERVED','COMPLETED')) AS ai_deep_used
      FROM users u
      LEFT JOIN entitlements e ON e.owner_id = u.id
      ORDER BY u.created_at DESC
      LIMIT 100
    `);

    return {
      users: result.rows.map((row) => ({
        ...row,
        isAdmin:
          row.role === "admin" ||
          (!!row.email && adminEmails.includes(row.email.toLowerCase())) ||
          (!!options.local &&
            (row.email === "local@snaap.invalid" ||
              row.id === "00000000-0000-4000-8000-000000000001")),
      })),
    };
  });

  // Change User Plan or Role
  app.post("/api/v1/admin/users/:userId/plan", async (req) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        plan: z
          .enum(["free", "pro_30d", "pro_1y", "pro_lifetime"])
          .optional(),
        role: z.enum(["user", "admin"]).optional(),
      })
      .parse(req.body);

    const userExists = (
      await db.query("SELECT id FROM users WHERE id=$1", [userId])
    ).rowCount;
    if (!userExists) {
      throw new ApiError(404, "USER_NOT_FOUND", "ไม่พบผู้ใช้ที่ระบุ");
    }

    if (body.plan) {
      if (body.plan === "free") {
        await db.query(
          "INSERT INTO entitlements(owner_id, pro_until) VALUES($1, now()) ON CONFLICT(owner_id) DO UPDATE SET pro_until=now()",
          [userId],
        );
      } else if (body.plan === "pro_30d") {
        await db.query(
          "INSERT INTO entitlements(owner_id, pro_until) VALUES($1, now() + interval '30 days') ON CONFLICT(owner_id) DO UPDATE SET pro_until=GREATEST(COALESCE(entitlements.pro_until, now()), EXCLUDED.pro_until)",
          [userId],
        );
      } else if (body.plan === "pro_1y") {
        await db.query(
          "INSERT INTO entitlements(owner_id, pro_until) VALUES($1, now() + interval '1 year') ON CONFLICT(owner_id) DO UPDATE SET pro_until=GREATEST(COALESCE(entitlements.pro_until, now()), EXCLUDED.pro_until)",
          [userId],
        );
      } else if (body.plan === "pro_lifetime") {
        await db.query(
          "INSERT INTO entitlements(owner_id, pro_until) VALUES($1, '2099-12-31 23:59:59+00') ON CONFLICT(owner_id) DO UPDATE SET pro_until=EXCLUDED.pro_until",
          [userId],
        );
      }
    }

    if (body.role) {
      await db.query("UPDATE users SET role=$2 WHERE id=$1", [userId, body.role]);
    }

    const updated = (
      await db.query(
        "SELECT u.id, u.email, u.role, e.pro_until FROM users u LEFT JOIN entitlements e ON e.owner_id=u.id WHERE u.id=$1",
        [userId],
      )
    ).rows[0];

    return {
      ok: true,
      user: {
        ...updated,
        isPro: updated.pro_until ? new Date(updated.pro_until) > new Date() : false,
      },
    };
  });

  // Reset User Monthly AI Quota
  app.post("/api/v1/admin/users/:userId/reset-quota", async (req) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(req.params);
    const deleteRes = await db.query(
      "DELETE FROM usage_ledger WHERE owner_id=$1 AND created_at >= date_trunc('month', now())",
      [userId],
    );
    return {
      ok: true,
      userId,
      deletedRecords: deleteRes.rowCount,
      message: "รีเซ็ตโควตาการใช้งาน AI ประจำเดือนเรียบร้อยแล้ว",
    };
  });

  // Impersonate User
  app.post("/api/v1/admin/users/:userId/impersonate", async (req, reply) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(req.params);
    const user = (
      await db.query("SELECT id, email FROM users WHERE id=$1", [userId])
    ).rows[0];
    if (!user) {
      throw new ApiError(404, "USER_NOT_FOUND", "ไม่พบผู้ใช้");
    }
    await options.session(userId, reply);
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
        "SELECT ms.rule_id, ms.exchange, ms.pair, ms.status, ms.checked_at, r.name as rule_name, u.email as owner_email FROM monitor_status ms JOIN rules r ON r.id = ms.rule_id JOIN users u ON u.id = r.owner_id WHERE ms.status != 'HEALTHY' ORDER BY ms.checked_at DESC LIMIT 50",
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

  // Activity & Incident Feed (Unified events timeline)
  app.get("/api/v1/admin/activity", async () => {
    const [signupsRes, billingRes, marketIssuesRes, deliveriesRes, aiRunsRes] =
      await Promise.all([
        db.query(
          "SELECT id, email, created_at FROM users WHERE created_at >= now() - interval '7 days' ORDER BY created_at DESC LIMIT 30",
        ),
        db.query(
          "SELECT bg.payment_id, bg.amount, bg.kind, bg.received_at, u.email FROM billing_grants bg JOIN users u ON u.id = bg.owner_id WHERE bg.received_at >= now() - interval '7 days' ORDER BY bg.received_at DESC LIMIT 20",
        ),
        db.query(
          "SELECT ms.rule_id, ms.exchange, ms.pair, ms.status, ms.checked_at, r.name as rule_name, u.email as owner_email FROM monitor_status ms JOIN rules r ON r.id = ms.rule_id JOIN users u ON u.id = r.owner_id WHERE ms.status != 'HEALTHY' ORDER BY ms.checked_at DESC LIMIT 20",
        ),
        db.query(
          "SELECT d.id, d.status, d.attempts, d.detail, dest.kind, dest.name as destination_name, s.pair, s.exchange, s.created_at, u.email as user_email FROM deliveries d JOIN destinations dest ON dest.id=d.destination_id JOIN signals s ON s.id=d.signal_id JOIN users u ON u.id = s.owner_id WHERE d.status IN ('FAILED', 'AMBIGUOUS', 'RETRY') ORDER BY s.created_at DESC LIMIT 20",
        ),
        db.query(
          "SELECT ar.id, ar.status, ar.created_at, u.email as user_email FROM agent_runs ar JOIN users u ON u.id=ar.owner_id WHERE ar.status IN ('FAILED', 'ERROR') ORDER BY ar.created_at DESC LIMIT 20",
        ),
      ]);

    const events: Array<{
      id: string;
      category: "signup" | "market" | "delivery" | "billing" | "system";
      severity: "info" | "success" | "warning" | "error";
      title: string;
      detail: string;
      timestamp: string;
    }> = [];

    // 1. Signups
    for (const row of signupsRes.rows) {
      events.push({
        id: `signup-${row.id}`,
        category: "signup",
        severity: "info",
        title: "👤 มีผู้ใช้งานใหม่ลงทะเบียน",
        detail: row.email ? `อีเมล: ${row.email}` : `User ID: ${row.id}`,
        timestamp: row.created_at,
      });
    }

    // 2. Billing / Upgrades
    for (const row of billingRes.rows) {
      events.push({
        id: `billing-${row.payment_id}`,
        category: "billing",
        severity: "success",
        title: "💳 ได้รับการชำระเงินแพ็กเกจ Pro",
        detail: `${row.email || "ผู้ใช้"} ชำระเงิน ${row.amount / 100} บาท ผ่าน ${row.kind}`,
        timestamp: row.received_at,
      });
    }

    // 3. Market Monitor Issues
    for (const row of marketIssuesRes.rows) {
      events.push({
        id: `market-${row.rule_id}-${row.exchange}-${row.pair}-${new Date(row.checked_at).getTime()}`,
        category: "market",
        severity: "warning",
        title: `⚠️ กระดาน ${row.exchange}: ข้อมูล ${row.pair} ผิดปกติ`,
        detail: `สถานะ: ${row.status} (กฎ: "${row.rule_name || row.rule_id}" โดย ${row.owner_email || "-"})`,
        timestamp: row.checked_at,
      });
    }

    // 4. Failed Deliveries
    for (const row of deliveriesRes.rows) {
      events.push({
        id: `delivery-${row.id}`,
        category: "delivery",
        severity: "error",
        title: `🚨 ส่งแจ้งเตือน ${row.kind} ไม่สำเร็จ (${row.pair})`,
        detail: `${row.destination_name ? `ช่องทาง "${row.destination_name}": ` : ""}${row.detail || `สถานะ ${row.status}`} (${row.user_email || "-"})`,
        timestamp: row.created_at,
      });
    }

    // 5. AI Errors
    for (const row of aiRunsRes.rows) {
      events.push({
        id: `ai-${row.id}`,
        category: "system",
        severity: "error",
        title: "🤖 การประมวลผล AI ล้มเหลว",
        detail: `ผู้ใช้ ${row.user_email || "-"} สถานะ ${row.status}`,
        timestamp: row.created_at,
      });
    }

    // 6. System log errors (recent 15)
    for (const log of getSystemLogs().slice(0, 15)) {
      events.push({
        id: `log-${log.id}`,
        category: "system",
        severity: log.statusCode && log.statusCode >= 500 ? "error" : "warning",
        title: `⚙️ ระบบเกิดข้อผิดพลาด: ${log.type}`,
        detail: `${log.method ? `[${log.method} ${log.url}] ` : ""}${log.message}`,
        timestamp: log.timestamp,
      });
    }

    // Sort descending by timestamp
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Compute today stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();

    const todayEvents = events.filter((e) => new Date(e.timestamp).getTime() >= todayMs);
    const summary = {
      todayTotal: todayEvents.length,
      todaySignups: todayEvents.filter((e) => e.category === "signup").length,
      todayIncidents: todayEvents.filter((e) => e.severity === "error" || e.severity === "warning").length,
      todayPayments: todayEvents.filter((e) => e.category === "billing").length,
    };

    return {
      summary,
      events,
    };
  });
}
