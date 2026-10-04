import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { z } from "zod";
import { ApiError } from "./errors.js";

export async function auditAdmin(
  db: Pick<pg.Pool, "query">,
  actor: string,
  action: string,
  subject?: string,
  detail: Record<string, unknown> = {},
) {
  await db.query(
    "INSERT INTO admin_audit(actor_id,subject_id,action,detail) VALUES($1,$2,$3,$4)",
    [actor, subject ?? null, action, JSON.stringify(detail)],
  );
}

export async function recordApiIncident(
  db: pg.Pool,
  method: string,
  route: string,
  status: number,
) {
  // Route templates only: no query strings, cookies, provider replies or request bodies.
  const location = `${method} ${route}`;
  await db.query(
    `INSERT INTO admin_events(event_key,category,severity,title,detail,status,metadata)
    VALUES($1,'system','error','API ทำงานไม่สำเร็จ',$2,'open',$3)
    ON CONFLICT(event_key) DO UPDATE SET updated_at=now(),occurrences=admin_events.occurrences+1,
    status='open',severity='error',title=excluded.title,detail=excluded.detail,metadata=excluded.metadata,resolved_at=NULL`,
    [
      `api:${location}`,
      `${location} · HTTP ${status}`,
      JSON.stringify({ route, method, status }),
    ],
  );
}

export function registerAdminEvents(
  app: FastifyInstance,
  db: pg.Pool,
  monitoring: boolean,
) {
  app.get("/api/v1/admin/activity", async (req) => {
    const q = z
      .object({
        category: z
          .enum(["signup", "market", "delivery", "billing", "system", "admin"])
          .optional(),
        severity: z.enum(["info", "success", "warning", "error"]).optional(),
        state: z.enum(["all", "unread", "open", "resolved"]).default("all"),
        before: z.string().max(300).regex(/^[A-Za-z0-9_-]+$/).optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      })
      .strict()
      .parse(req.query);
    let cursor: {time:string;id:string} | undefined;
    if(q.before) {
      try {
        cursor=z.object({time:z.iso.datetime({offset:true}),id:z.string().uuid()}).strict().parse(JSON.parse(Buffer.from(q.before,'base64url').toString('utf8')));
      } catch { throw new ApiError(400,'INVALID_CURSOR','ตำแหน่งเหตุการณ์ไม่ถูกต้อง'); }
    }
    if (monitoring) {
      await db.query(`INSERT INTO admin_events(event_key,category,severity,title,detail,status)
        SELECT 'service:monitor','system','error','ตัวเฝ้าตลาดหยุดตอบสนอง','ไม่มีรอบสแกนสำเร็จใน 3 นาที','open'
        WHERE NOT EXISTS(SELECT 1 FROM service_heartbeats WHERE service='monitor' AND checked_at>now()-interval '3 minutes')
        ON CONFLICT(event_key) DO UPDATE SET status='open',severity='error',title=excluded.title,detail=excluded.detail,resolved_at=NULL,updated_at=now(),
          occurrences=admin_events.occurrences+1 WHERE admin_events.status!='open'`);
      await db.query(`UPDATE admin_events SET status='resolved',severity='success',title='ตัวเฝ้าตลาดกลับมาทำงาน',resolved_at=now(),updated_at=now(),detail='ตัวเฝ้าตลาดกลับมาสแกนสำเร็จแล้ว'
        WHERE event_key='service:monitor' AND status='open'
        AND EXISTS(SELECT 1 FROM service_heartbeats WHERE service='monitor' AND checked_at>now()-interval '3 minutes')`);
    }
    // Counts are independent of the feed page, use the product's Bangkok calendar day.
    const [summary, active, feed, highlights] = await Promise.all([
      db.query(
        `WITH day AS (SELECT date_trunc('day',now() AT TIME ZONE 'Asia/Bangkok') AT TIME ZONE 'Asia/Bangkok' AS starts)
        SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "checkedAt",
        (SELECT count(*)::int FROM users,day WHERE created_at>=day.starts AND email IS DISTINCT FROM 'local@snaap.invalid') AS "todaySignups",
        (SELECT count(*)::int FROM billing_grants,day WHERE received_at>=day.starts AND NOT refunded) AS "todayPayments",
        count(*) FILTER(WHERE e.created_at>=day.starts)::int AS "todayTotal",
        count(*) FILTER(WHERE e.updated_at>=day.starts AND e.category IN ('market','delivery','system'))::int AS "todayIncidents",
        count(*) FILTER(WHERE e.updated_at>=day.starts AND e.category='delivery')::int AS "todayDeliveries",
        count(*) FILTER(WHERE e.status='open')::int AS "openIncidents",
        count(*) FILTER(WHERE r.seen_at IS NULL OR r.seen_at<e.updated_at)::int AS "unread"
        FROM admin_events e CROSS JOIN day LEFT JOIN admin_event_receipts r ON r.event_id=e.id AND r.admin_id=$1`,
        [req.userId],
      ),
      db.query(
        "SELECT category,title,severity FROM admin_events WHERE status='open' ORDER BY (severity='error') DESC,updated_at DESC LIMIT 3",
      ),
      db.query(
        `SELECT e.*,e.updated_at AS timestamp,to_char(e.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_time,(r.seen_at IS NULL OR r.seen_at<e.updated_at) AS unread
        FROM admin_events e LEFT JOIN admin_event_receipts r ON r.event_id=e.id AND r.admin_id=$1
        WHERE ($2::text IS NULL OR e.category=$2) AND ($3::text IS NULL OR e.severity=$3)
        AND ($4='all' OR ($4='unread' AND (r.seen_at IS NULL OR r.seen_at<e.updated_at)) OR e.status=$4)
        AND ($5::timestamptz IS NULL OR (e.updated_at,e.id)<($5::timestamptz,$6::uuid))
        ORDER BY e.updated_at DESC,e.id DESC LIMIT $7`,
        [
          req.userId,
          q.category ?? null,
          q.severity ?? null,
          q.state,
          cursor?.time ?? null,
          cursor?.id ?? null,
          q.limit + 1,
        ],
      ),
      db.query(
        `SELECT e.*,e.updated_at AS timestamp,(r.seen_at IS NULL OR r.seen_at<e.updated_at) AS unread
        FROM admin_events e LEFT JOIN admin_event_receipts r ON r.event_id=e.id AND r.admin_id=$1 ORDER BY e.updated_at DESC,e.id DESC LIMIT 10`,
        [req.userId],
      ),
    ]);
    const events = feed.rows.slice(0, q.limit);
    const last=events.at(-1);
    return {
      summary: summary.rows[0] ?? {},
      events,
      highlights: highlights.rows,
      activeIncidents: active.rows,
      nextCursor: feed.rows.length > q.limit ? Buffer.from(JSON.stringify({time:last.cursor_time,id:last.id})).toString('base64url') : null,
      timezone: "Asia/Bangkok",
      checkedAt: summary.rows[0]?.checkedAt ?? new Date().toISOString(),
      monitoring,
    };
  });
  app.post("/api/v1/admin/activity/:id/acknowledge", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const result = await db.query(
      `INSERT INTO admin_event_receipts(event_id,admin_id,seen_at)
      SELECT id,$2,updated_at FROM admin_events WHERE id=$1
      ON CONFLICT(event_id,admin_id) DO UPDATE SET seen_at=excluded.seen_at RETURNING event_id`,
      [id, req.userId],
    );
    if (!result.rowCount)
      throw new ApiError(404, "EVENT_NOT_FOUND", "ไม่พบเหตุการณ์");
    return { ok: true };
  });
  app.post("/api/v1/admin/activity/read-all", async (req) => {
    const { through } = z
      .object({ through: z.iso.datetime({ offset: true }) })
      .strict()
      .parse(req.body);
    await db.query(
      `INSERT INTO admin_event_receipts(event_id,admin_id,seen_at)
      SELECT id,$1,updated_at FROM admin_events WHERE updated_at<=$2
      ON CONFLICT(event_id,admin_id) DO UPDATE SET seen_at=GREATEST(admin_event_receipts.seen_at,excluded.seen_at)`,
      [req.userId, through],
    );
    return { ok: true };
  });
  app.get("/api/v1/admin/audit", async () => ({
    entries: (
      await db.query(`SELECT a.*,u.email AS actor_email,s.email AS subject_email
    FROM admin_audit a LEFT JOIN users u ON u.id=a.actor_id LEFT JOIN users s ON s.id=a.subject_id ORDER BY a.created_at DESC,a.id DESC LIMIT 100`)
    ).rows,
  }));
}
