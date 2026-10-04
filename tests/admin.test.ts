import { test } from "node:test";
import assert from "node:assert/strict";
import type pg from "pg";
import { buildApp } from "../src/api.js";
import {
  recordSystemLog,
  getSystemLogs,
  clearSystemLogs,
  isUserAdmin,
} from "../src/admin.js";
import { hash } from "../src/crypto.js";

test("system log buffer records, retrieves, and clears entries", () => {
  clearSystemLogs();
  assert.equal(getSystemLogs().length, 0);

  recordSystemLog({
    type: "TEST_ERROR",
    message: "Something went wrong",
    statusCode: 500,
    url: "/api/v1/test",
    method: "POST",
  });

  const logs = getSystemLogs();
  assert.equal(logs.length, 1);
  assert.equal(logs[0].type, "TEST_ERROR");
  assert.equal(logs[0].message, "Something went wrong");
  assert.equal(logs[0].statusCode, 500);

  clearSystemLogs();
  assert.equal(getSystemLogs().length, 0);
});

test("isUserAdmin checks role, email list, and local mode", async () => {
  const mockDb = (userRow: any) =>
    ({
      query: async () => ({
        rowCount: userRow ? 1 : 0,
        rows: userRow ? [userRow] : [],
      }),
    }) as unknown as pg.Pool;

  // Non-existent user
  let res = await isUserAdmin(mockDb(null), "00000000-0000-0000-0000-000000000000");
  assert.equal(res.isAdmin, false);

  // Normal user, not local
  res = await isUserAdmin(
    mockDb({ id: "123", email: "user@example.com", role: "user" }),
    "123",
    false,
  );
  assert.equal(res.isAdmin, false);

  // User with role 'admin'
  res = await isUserAdmin(
    mockDb({ id: "123", email: "user@example.com", role: "admin" }),
    "123",
    false,
  );
  assert.equal(res.isAdmin, true);

  // Local user in local mode
  res = await isUserAdmin(
    mockDb({
      id: "00000000-0000-4000-8000-000000000001",
      email: "local@snaap.invalid",
      role: "user",
    }),
    "00000000-0000-4000-8000-000000000001",
    true,
  );
  assert.equal(res.isAdmin, true);

  // User in ADMIN_EMAILS
  const origEnv = process.env.ADMIN_EMAILS;
  try {
    process.env.ADMIN_EMAILS = "super@snaap.com, chief@snaap.com";
    res = await isUserAdmin(
      mockDb({ id: "456", email: "super@snaap.com", role: "user" }),
      "456",
      false,
    );
    assert.equal(res.isAdmin, true);
  } finally {
    process.env.ADMIN_EMAILS = origEnv;
  }
});

test("admin endpoints enforce permissions and support plan/quota updates", async () => {
  const testUserId = "00000000-0000-4000-8000-000000000001";
  const targetUserId = "11111111-1111-4111-8111-111111111111";
  const rawSession = "11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff";
  const tokenHash = hash(rawSession);

  const queries: { sql: string; values: any[] }[] = [];
  const db = {
    query: async (sql: string, values: any[] = []) => {
      queries.push({ sql, values });
      if (sql.includes("FROM sessions WHERE token_hash=$1")) {
        return { rowCount: 1, rows: [{ user_id: testUserId }] };
      }
      if (sql.includes("SELECT id, email, role, created_at FROM users WHERE id=$1")) {
        return {
          rowCount: 1,
          rows: [
            {
              id: testUserId,
              email: "local@snaap.invalid",
              role: "admin",
              created_at: new Date(),
            },
          ],
        };
      }
      if (sql.includes("SELECT id FROM users WHERE id=$1")) {
        return { rowCount: 1, rows: [{ id: targetUserId }] };
      }
      if (sql.includes("SELECT u.id, u.email, u.role, e.pro_until FROM users")) {
        return {
          rowCount: 1,
          rows: [
            {
              id: targetUserId,
              email: "target@example.com",
              role: "user",
              pro_until: new Date(Date.now() + 30 * 86400000).toISOString(),
            },
          ],
        };
      }
      if (sql.includes("DELETE FROM usage_ledger")) {
        return { rowCount: 5, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    },
  } as unknown as pg.Pool;

  const { app } = await buildApp(db, { local: true });
  try {
    // 1. Unauthenticated request to /api/v1/admin/overview -> 401
    const unauth = await app.inject({
      method: "GET",
      url: "/api/v1/admin/overview",
      headers: { host: "127.0.0.1:4173" },
    });
    assert.equal(unauth.statusCode, 401);

    // 2. Authenticated admin request -> 200
    const overview = await app.inject({
      method: "GET",
      url: "/api/v1/admin/overview",
      headers: {
        host: "127.0.0.1:4173",
        cookie: `snaap_session=${rawSession}`,
      },
    });
    assert.equal(overview.statusCode, 200);
    const overviewData = JSON.parse(overview.body);
    assert.ok(overviewData.health);
    assert.ok(overviewData.kpis);

    // 3. Update user plan
    const updatePlan = await app.inject({
      method: "POST",
      url: `/api/v1/admin/users/${targetUserId}/plan`,
      headers: {
        host: "127.0.0.1:4173",
        "x-snaap-client": "web",
        cookie: `snaap_session=${rawSession}`,
        "content-type": "application/json",
      },
      payload: { plan: "pro_30d" },
    });
    assert.equal(updatePlan.statusCode, 200);
    const planData = JSON.parse(updatePlan.body);
    assert.equal(planData.ok, true);
    assert.equal(planData.user.isPro, true);

    // 4. Reset user quota
    const resetQuota = await app.inject({
      method: "POST",
      url: `/api/v1/admin/users/${targetUserId}/reset-quota`,
      headers: {
        host: "127.0.0.1:4173",
        "x-snaap-client": "web",
        cookie: `snaap_session=${rawSession}`,
        "content-type": "application/json",
      },
      payload: {},
    });
    assert.equal(resetQuota.statusCode, 200);
    const quotaData = JSON.parse(resetQuota.body);
    assert.equal(quotaData.ok, true);
    assert.equal(quotaData.deletedRecords, 5);

    // 5. Activity & Incident Feed
    const activity = await app.inject({
      method: "GET",
      url: "/api/v1/admin/activity",
      headers: {
        host: "127.0.0.1:4173",
        cookie: `snaap_session=${rawSession}`,
      },
    });
    assert.equal(activity.statusCode, 200);
    const activityData = JSON.parse(activity.body);
    assert.ok(activityData.summary);
    assert.ok(Array.isArray(activityData.events));
  } finally {
    await app.close();
  }
});
