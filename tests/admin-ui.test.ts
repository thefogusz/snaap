import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const payload = '<img src=x onerror="alert(1)">';
async function dashboard() {
  const nodes = new Map<string, any>();
  const node = (id: string) => {
    if (!nodes.has(id))
      nodes.set(id, {
        innerHTML: "",
        textContent: "",
        hidden: false,
        dataset: {},
        classList: { toggle() {} },
        listeners: {} as Record<string, Function>,
        addEventListener(event: string, handler: Function) {
          this.listeners[event] = handler;
        },
        setAttribute() {},
        removeAttribute() {},
        focus() {},
      });
    return nodes.get(id);
  };
  const tabs = ["overview", "activity", "users", "diagnostics"].map((tab) =>
    Object.assign(node(`tab-${tab}`), { dataset: { tab } }),
  );
  const plans = ["free", "pro_month", "pro_lifetime"].map((plan) =>
    Object.assign(node(`plan-${plan}`), { dataset: { plan } }),
  );
  const mutations: string[] = [];
  let releaseMutation: (() => void) | undefined;
  let init: Function = () => {},
    poll: Function = () => {},
    offline = false;
  const toasts: string[] = [];
  const event = {
    id: "11111111-1111-4111-8111-111111111111",
    category: "market",
    severity: "warning",
    title: payload,
    detail: payload,
    status: "open",
    occurrences: 1,
    unread: true,
    timestamp: "2026-10-04T23:00:00Z",
    created_at: "2026-10-04T23:00:00Z",
    metadata: {},
  };
  const delivery = {
    created_at: event.timestamp,
    kind: "telegram",
    destination_name: payload,
    pair: "BTC/USDT",
    exchange: "Binance",
    status: "FAILED",
    detail: payload,
  };
  const responses: Record<string, unknown> = {
    "/api/v1/admin/overview": {
      health: {
        database: { status: "healthy", latencyMs: 1 },
        monitor: {
          enabled: true,
          status: "healthy",
          checkedAt: event.timestamp,
        },
        ai: { configured: false },
        billing: { configured: false },
        telegram: { configured: false },
        line: { configured: false },
        uptimeSeconds: 60,
        memoryMb: 10,
      },
      kpis: {
        totalUsers: 1,
        proUsers: 0,
        adminUsers: 1,
        activeRules: 1,
        totalRules: 1,
        signals24h: 1,
        deliveries24h: { delivered: 0, failed: 1, pending: 0 },
        aiCallsMonth: { total: 0, standard: 0, deep: 0 },
      },
      recentDeliveries: [delivery],
    },
    "/api/v1/admin/activity": {
      summary: { unread: 1, openIncidents: 1 },
      events: [event],
      highlights: [event],
      activeIncidents: [event],
      checkedAt: event.timestamp,
      nextCursor: null,
    },
    "/api/v1/admin/users": {
      users: [
        {
          id: event.id,
          email: payload,
          role: "user",
          is_pro: false,
          isAdmin: false,
          created_at: event.timestamp,
        },
      ],
      nextCursor: null,
    },
    "/api/v1/admin/diagnostics": {
      failedDeliveries: [delivery],
      marketIssues: [
        {
          exchange: "Binance",
          pair: "BTC/USDT",
          status: "DATA_UNAVAILABLE",
          rule_name: payload,
          owner_email: payload,
          checked_at: event.timestamp,
        },
      ],
      recentLogs: [
        {
          type: "ERROR",
          message: payload,
          url: payload,
          method: "GET",
          timestamp: event.timestamp,
        },
      ],
    },
    "/api/v1/admin/audit": {
      entries: [
        {
          action: "quota.reset",
          actor_email: payload,
          subject_email: payload,
          created_at: event.timestamp,
        },
      ],
    },
  };
  runInNewContext(
    await readFile(new URL("../dist/admin.js", import.meta.url), "utf8"),
    {
      document: {
        querySelector: node,
        querySelectorAll: (selector: string) =>
          selector === ".tab-btn"
            ? tabs
            : selector === ".modal-option-btn" ||
                selector === "#plan-modal button"
              ? plans
              : [],
        addEventListener: (_: string, handler: Function) => {
          init = handler;
        },
      },
      window: {
        SnaapToast: { show: (s: string) => toasts.push(s) },
        location: {},
      },
      console: { error() {} },
      URLSearchParams,
      AbortSignal,
      setTimeout,
      clearTimeout,
      setInterval: (handler: Function) => {
        poll = handler;
      },
      fetch: async (url: string, options: any) => {
        if (offline) throw new Error("offline");
        if (options.method === "POST") {
          mutations.push(url);
          await new Promise<void>((resolve) => {
            releaseMutation = resolve;
          });
          return { status: 200, ok: true, json: async () => ({}) };
        }
        return {
          status: 200,
          ok: true,
          json: async () => responses[url.split("?")[0]],
        };
      },
    },
  );
  const flush = async () => {
    await new Promise(setImmediate);
    await new Promise(setImmediate);
  };
  init();
  await flush();
  return {
    node,
    tabs,
    flush,
    toasts,
    event,
    poll,
    plans,
    mutations,
    releaseMutation: () => releaseMutation?.(),
    setOffline: () => {
      offline = true;
    },
  };
}

test("admin dashboard escapes stored HTML in overview, feed, users, diagnostics and audit", async () => {
  const page = await dashboard();
  page.tabs[2].listeners.click();
  await page.flush();
  page.tabs[3].listeners.click();
  await page.flush();
  for (const selector of [
    "#recent-deliveries-tbody",
    "#today-feed-preview",
    "#activity-timeline-list",
    "#users-tbody",
    "#failed-deliveries-tbody",
    "#market-issues-tbody",
    "#system-logs-box",
    "#admin-audit-list",
  ]) {
    const html = page.node(selector).innerHTML;
    assert.ok(
      html.includes("&lt;img"),
      `${selector} should show the payload as text`,
    );
    assert.ok(
      !html.includes("<img"),
      `${selector} must not create an executable element`,
    );
  }
});

test("plan changes prevent conflicting repeated clicks and keep the modal open until saved", async () => {
  const page = await dashboard();
  page.node("#plan-modal").hidden = false;
  const saving = page.plans[0].listeners.click();
  await page.flush();
  await page.plans[1].listeners.click();
  page.node("#btn-modal-close").listeners.click();
  assert.equal(page.mutations.length, 1);
  assert.ok(page.plans.every((button) => button.disabled));
  assert.equal(page.node("#plan-modal").hidden, false);
  page.releaseMutation();
  await saving;
  assert.equal(page.node("#plan-modal").hidden, true);
  assert.ok(page.plans.every((button) => !button.disabled));
});

test("failed first user load offers a visible retry instead of an endless loading row", async () => {
  const page = await dashboard();
  page.setOffline();
  page.tabs[2].listeners.click();
  await page.flush();
  assert.ok(page.node("#users-tbody").innerHTML.includes("กดรีเฟรช"));
});

test("admin polling announces new versions once and retains a visible stale-data warning offline", async () => {
  const page = await dashboard();
  assert.equal(
    page.toasts.length,
    0,
    "initial history does not create a notification storm",
  );
  page.poll();
  await page.flush();
  assert.equal(page.toasts.length, 0);
  page.event.timestamp = "2026-10-04T23:01:00Z";
  page.poll();
  await page.flush();
  assert.equal(page.toasts.length, 1);
  page.poll();
  await page.flush();
  assert.equal(page.toasts.length, 1);
  page.setOffline();
  page.poll();
  await page.flush();
  assert.ok(
    page
      .node("#connection-status")
      .textContent.includes("ข้อมูลที่แสดงอาจเก่า"),
  );
  assert.ok(page.node("#activity-timeline-list").innerHTML.includes("&lt;img"));
});
