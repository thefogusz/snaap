"use strict";

(() => {
  let state = {
    overview: null,
    activity: { summary: {}, events: [] },
    users: [],
    diagnostics: null,
    activeTab: "overview",
    filter: "all",
    feedFilter: "all",
    search: "",
    selectedUserId: null,
    feedState: "all",
    feedSeverity: "",
    feedCursor: null,
    userCursor: null,
    eventVersions: new Map(),
    feedLoaded: false,
    feedRequest: 0,
    userRequest: 0,
  };

  const escapeHTML = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  function showToast(message) {
    if (window.SnaapToast) {
      window.SnaapToast.show(message);
    } else {
      const toast = $("#toast");
      if (toast) {
        toast.textContent = message;
        toast.hidden = false;
        setTimeout(() => (toast.hidden = true), 2500);
      }
    }
  }

  function formatDate(isoString) {
    if (!isoString) return "-";
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString((globalThis.SnaapI18n?.locale ?? "th-TH"), {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Bangkok",
      });
    } catch {
      return isoString;
    }
  }

  function formatRelativeDays(isoString) {
    if (!isoString) return "";
    try {
      const d = new Date(isoString);
      if (d.getFullYear() > 2090) return (globalThis.SnaapI18n?.text("ตลอดชีพ") ?? "ตลอดชีพ");
      const now = new Date();
      const diffHours = Math.round(
        (d.getTime() - now.getTime()) / (1000 * 3600),
      );
      if (diffHours <= 0) return (globalThis.SnaapI18n?.text("หมดอายุแล้ว") ?? "หมดอายุแล้ว");
      if (diffHours < 24) return `${(globalThis.SnaapI18n?.text("เหลือ ") ?? "เหลือ ")}${diffHours}${(globalThis.SnaapI18n?.text(" ชม.") ?? " ชม.")}`;
      const diffDays = Math.ceil(diffHours / 24);
      return `${(globalThis.SnaapI18n?.text("เหลือ ") ?? "เหลือ ")}${diffDays}${(globalThis.SnaapI18n?.text(" วัน") ?? " วัน")}`;
    } catch {
      return "";
    }
  }

  function formatTimeAgo(isoString) {
    if (!isoString) return "";
    try {
      const d = new Date(isoString);
      const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
      if (diffSec < 60) return (globalThis.SnaapI18n?.text("เมื่อสักครู่") ?? "เมื่อสักครู่");
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin}${(globalThis.SnaapI18n?.text(" นาทีที่แล้ว") ?? " นาทีที่แล้ว")}`;
      const diffHour = Math.floor(diffMin / 60);
      if (diffHour < 24) return `${diffHour}${(globalThis.SnaapI18n?.text(" ชั่วโมงที่แล้ว") ?? " ชั่วโมงที่แล้ว")}`;
      const diffDay = Math.floor(diffHour / 24);
      return `${diffDay}${(globalThis.SnaapI18n?.text(" วันที่แล้ว") ?? " วันที่แล้ว")}`;
    } catch {
      return "";
    }
  }

  async function apiFetch(url, options = {}) {
    const defaultHeaders = {
      "x-snaap-client": "web",
      "Content-Type": "application/json",
    };
    const res = await fetch(url, {
      signal: AbortSignal.timeout(12000),
      ...options,
      headers: { ...defaultHeaders, ...(options.headers || {}) },
    });

    if (res.status === 401) {
      if (!state.redirecting) {
        state.redirecting = true;
        window.location.href = "/admin/login";
      }
      throw new Error("UNAUTHENTICATED");
    }

    if (res.status === 403) {
      const err = await res.json().catch(() => ({}));
      if (!state.redirecting) {
        state.redirecting = true;
        window.location.href = "/admin/login?error=admin_denied";
      }
      throw new Error(err.error?.message || "FORBIDDEN");
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || (globalThis.SnaapI18n?.text("คำขอล้มเหลว") ?? "คำขอล้มเหลว"));
    }

    return res.json();
  }

  // Tab Navigation
  function setupTabs() {
    $$(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = btn.dataset.tab;
        state.activeTab = tab;
        $$(".tab-btn").forEach((b) => b.classList.toggle("active", b === btn));
        $$(".tab-panel").forEach((panel) => {
          panel.classList.toggle("active", panel.id === `panel-${tab}`);
        });

        if (tab === "activity") {
          loadActivity();
        } else if (tab === "users" && state.users.length === 0) {
          loadUsers();
        } else if (tab === "diagnostics") {
          loadDiagnostics();
        }
      });
    });
  }

  // Load Overview Data
  async function loadOverview() {
    if (!state.overview) $("#recent-deliveries-tbody").innerHTML = '<tr><td colspan="5">'+skeletonUI('rows', (globalThis.SnaapI18n?.text("กำลังโหลดภาพรวม…") ?? "กำลังโหลดภาพรวม…"))+'</td></tr>';
    try {
      const data = await apiFetch("/api/v1/admin/overview", { cache: "no-store" });
      state.overview = data;
      renderOverview(data);
    } catch (err) {
      console.error("Overview error", err);
      if (!state.overview) $("#recent-deliveries-tbody").innerHTML = (globalThis.SnaapI18n?.text("<tr><td colspan=\"5\" class=\"empty-state\">โหลดภาพรวมไม่สำเร็จ กดรีเฟรชเพื่อลองอีกครั้ง</td></tr>") ?? "<tr><td colspan=\"5\" class=\"empty-state\">โหลดภาพรวมไม่สำเร็จ กดรีเฟรชเพื่อลองอีกครั้ง</td></tr>");
      $("#system-status-pill").className = "badge badge-danger";
      $("#system-status-text").textContent = (globalThis.SnaapI18n?.text("เชื่อมต่อล้มเหลว") ?? "เชื่อมต่อล้มเหลว");
    }
  }

  function renderOverview(data) {
    const { health, kpis, recentDeliveries } = data;

    // Header Status Pill
    const dbOk = health.database.status === "healthy";
    const checkedTime = new Date().toLocaleTimeString((globalThis.SnaapI18n?.locale ?? "th-TH"), {
      timeZone: "Asia/Bangkok",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    $("#system-status-pill").title =
      (globalThis.SnaapI18n?.text("เวลาที่เซิร์ฟเวอร์รอฐานข้อมูล รวมการเชื่อมต่อ · ตรวจทุก 15 วินาที") ?? "เวลาที่เซิร์ฟเวอร์รอฐานข้อมูล รวมการเชื่อมต่อ · ตรวจทุก 15 วินาที");
    $("#system-status-pill").className = dbOk
      ? "badge badge-success"
      : "badge badge-danger";
    $("#system-status-text").textContent = dbOk
      ? `${(globalThis.SnaapI18n?.text("ฐานข้อมูล ") ?? "ฐานข้อมูล ")}${health.database.latencyMs} ms · ${checkedTime}`
      : `${(globalThis.SnaapI18n?.text("ฐานข้อมูลผิดปกติ · ") ?? "ฐานข้อมูลผิดปกติ · ")}${checkedTime}`;

    // KPIs
    $("#kpi-total-users").textContent = kpis.totalUsers;
    $("#kpi-pro-users").textContent =
      `${kpis.proUsers}${(globalThis.SnaapI18n?.text(" บัญชี Pro (") ?? " บัญชี Pro (")}${kpis.adminUsers} Admin)`;
    $("#kpi-users-badge").textContent = `${kpis.totalUsers}${(globalThis.SnaapI18n?.text(" บัญชี") ?? " บัญชี")}`;

    $("#kpi-active-rules").textContent = kpis.activeRules;
    $("#kpi-total-rules").textContent = `${(globalThis.SnaapI18n?.text("จากทั้งหมด ") ?? "จากทั้งหมด ")}${kpis.totalRules}${(globalThis.SnaapI18n?.text(" กฎ") ?? " กฎ")}`;

    $("#kpi-signals-24h").textContent = kpis.signals24h;

    const del = kpis.deliveries24h;
    $("#kpi-deliveries-success").textContent = del.delivered;
    $("#kpi-deliveries-sub").textContent =
      `${(globalThis.SnaapI18n?.text("สำเร็จ ") ?? "สำเร็จ ")}${del.delivered}${(globalThis.SnaapI18n?.text(" / ล้มเหลว ") ?? " / ล้มเหลว ")}${del.failed}${(globalThis.SnaapI18n?.text(" / รอส่ง ") ?? " / รอส่ง ")}${del.pending}`;
    $("#kpi-delivery-badge").className =
      del.failed > 0 ? "badge badge-danger" : "badge badge-success";
    $("#kpi-delivery-badge").textContent =
      del.failed > 0 ? `${(globalThis.SnaapI18n?.text("ล้มเหลว ") ?? "ล้มเหลว ")}${del.failed}` : (globalThis.SnaapI18n?.text("ไม่มีรายการล้มเหลว") ?? "ไม่มีรายการล้มเหลว");

    const ai = kpis.aiCallsMonth;
    $("#kpi-ai-total").textContent = ai.total;
    $("#kpi-ai-breakdown").textContent =
      `Standard: ${ai.standard} | Deep: ${ai.deep}${(globalThis.SnaapI18n?.text(" · ต้นทุนประมาณ $") ?? " · ต้นทุนประมาณ $")}${Number(ai.estimatedUsd || 0).toFixed(3)}`;

    // Health cards
    $("#health-db-desc").textContent =
      `${(globalThis.SnaapI18n?.text("ความเร็วการตอบสนอง ") ?? "ความเร็วการตอบสนอง ")}${health.database.latencyMs} ms`;
    $("#badge-health-db").className = dbOk
      ? "badge badge-success"
      : "badge badge-danger";
    $("#badge-health-db").textContent = dbOk ? (globalThis.SnaapI18n?.text("ปกติ") ?? "ปกติ") : "Error";
    const monitor = health.monitor;
    $("#health-market-desc").textContent = monitor.enabled
      ? monitor.checkedAt
        ? `${(globalThis.SnaapI18n?.text("สแกนสำเร็จล่าสุด ") ?? "สแกนสำเร็จล่าสุด ")}${formatDate(monitor.checkedAt)}`
        : (globalThis.SnaapI18n?.text("ยังไม่พบรอบสแกนสำเร็จ") ?? "ยังไม่พบรอบสแกนสำเร็จ")
      : (globalThis.SnaapI18n?.text("ยังไม่เปิดตัวเฝ้าตลาด") ?? "ยังไม่เปิดตัวเฝ้าตลาด");
    $("#badge-health-market").className =
      `badge ${monitor.status === "healthy" ? "badge-success" : monitor.enabled ? "badge-danger" : "badge-free"}`;
    $("#badge-health-market").textContent =
      monitor.status === "healthy"
        ? (globalThis.SnaapI18n?.text("กำลังสแกน") ?? "กำลังสแกน")
        : monitor.enabled
          ? (globalThis.SnaapI18n?.text("ไม่ตอบสนอง") ?? "ไม่ตอบสนอง")
          : (globalThis.SnaapI18n?.text("ปิดอยู่") ?? "ปิดอยู่");

    $("#health-ai-desc").textContent = health.ai.configured
      ? `${(globalThis.SnaapI18n?.text("โมเดล: ") ?? "โมเดล: ")}${health.ai.standardModel} / ${health.ai.deepModel}`
      : (globalThis.SnaapI18n?.text("ยังไม่ได้ตั้งค่า API Key") ?? "ยังไม่ได้ตั้งค่า API Key");
    $("#badge-health-ai").className = health.ai.configured
      ? "badge badge-success"
      : "badge badge-warning";
    $("#badge-health-ai").textContent = health.ai.configured
      ? (globalThis.SnaapI18n?.text("ตั้งค่าแล้ว") ?? "ตั้งค่าแล้ว")
      : (globalThis.SnaapI18n?.text("ยังไม่ได้ตั้งค่า") ?? "ยังไม่ได้ตั้งค่า");

    $("#health-stripe-desc").textContent = health.billing.configured
      ? health.billing.liveEnabled
        ? (globalThis.SnaapI18n?.text("เปิดรับเงินจริง (Live Mode)") ?? "เปิดรับเงินจริง (Live Mode)")
        : (globalThis.SnaapI18n?.text("โหมดทดสอบ (Test Mode)") ?? "โหมดทดสอบ (Test Mode)")
      : (globalThis.SnaapI18n?.text("ยังไม่ได้เชื่อมต่อ Stripe") ?? "ยังไม่ได้เชื่อมต่อ Stripe");
    $("#badge-health-stripe").className = health.billing.configured
      ? "badge badge-success"
      : "badge badge-free";
    $("#badge-health-stripe").textContent = health.billing.configured
      ? (globalThis.SnaapI18n?.text("ตั้งค่าแล้ว") ?? "ตั้งค่าแล้ว")
      : (globalThis.SnaapI18n?.text("ปิดอยู่") ?? "ปิดอยู่");

    const channels = [];
    if (health.telegram.configured) channels.push("Telegram");
    if (health.line.configured) channels.push("LINE");
    $("#health-channels-desc").textContent =
      channels.length > 0
        ? `${(globalThis.SnaapI18n?.text("ช่องทางที่เปิด: ") ?? "ช่องทางที่เปิด: ")}${channels.join(", ")}`
        : (globalThis.SnaapI18n?.text("ยังไม่ได้ระบุ Bot Credentials") ?? "ยังไม่ได้ระบุ Bot Credentials");
    $("#badge-health-channels").className =
      channels.length > 0 ? "badge badge-success" : "badge badge-free";
    $("#badge-health-channels").textContent =
      channels.length > 0 ? (globalThis.SnaapI18n?.text("เปิดใช้งาน") ?? "เปิดใช้งาน") : (globalThis.SnaapI18n?.text("ไม่มี") ?? "ไม่มี");

    const uptimeMins = Math.floor(health.uptimeSeconds / 60);
    $("#health-runtime-desc").textContent =
      `Uptime: ${uptimeMins}${(globalThis.SnaapI18n?.text(" นาที | Memory: ") ?? " นาที | Memory: ")}${health.memoryMb} MB`;

    // Recent deliveries table
    const tbody = $("#recent-deliveries-tbody");
    if (!recentDeliveries || recentDeliveries.length === 0) {
      tbody.innerHTML = (globalThis.SnaapI18n?.text("<tr><td colspan=\"5\" class=\"empty-state\">ยังไม่มีการส่งข้อความแจ้งเตือนล่าสุด</td></tr>") ?? "<tr><td colspan=\"5\" class=\"empty-state\">ยังไม่มีการส่งข้อความแจ้งเตือนล่าสุด</td></tr>");
      return;
    }

    tbody.innerHTML = recentDeliveries
      .map((d) => {
        let badgeClass = "badge-free";
        if (d.status === "DELIVERED") badgeClass = "badge-success";
        else if (d.status === "FAILED" || d.status === "AMBIGUOUS")
          badgeClass = "badge-danger";
        else if (d.status === "RETRY" || d.status === "PENDING")
          badgeClass = "badge-warning";

        return `
        <tr>
          <td>${formatDate(d.created_at)}</td>
          <td><span class="badge badge-free">${escapeHTML(d.kind || "-")}</span> ${escapeHTML(d.destination_name || "")}</td>
          <td><strong>${escapeHTML(d.pair || "-")}</strong> <small style="color:var(--tertiary);">(${escapeHTML(d.exchange || "-")})</small></td>
          <td><span class="badge ${badgeClass}">${escapeHTML(d.status)}</span></td>
          <td style="font-size:12px;color:var(--secondary);">${escapeHTML(d.detail || "-")}</td>
        </tr>
      `;
      })
      .join("");
  }

  function getCategoryIcon(cat) {
    switch (cat) {
      case "signup":
        return "👤";
      case "market":
        return "⚠️";
      case "delivery":
        return "🚨";
      case "billing":
        return "💳";
      case "system":
        return "⚙️";
      default:
        return "🔔";
    }
  }

  function isToday(isoString) {
    if (!isoString) return false;
    const d = new Date(isoString);
    const now = new Date();
    return (
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear()
    );
  }

  // Load Activity & Incident Feed
  async function loadActivity(append = false, background = false) {
    const request = ++state.feedRequest;
    if (!state.feedLoaded) $("#activity-timeline-list").innerHTML = skeletonUI('rows', (globalThis.SnaapI18n?.text("กำลังโหลดเหตุการณ์…") ?? "กำลังโหลดเหตุการณ์…"));
    const query = new URLSearchParams({ state: state.feedState, limit: "50" });
    if (state.feedFilter !== "all") query.set("category", state.feedFilter);
    if (state.feedSeverity) query.set("severity", state.feedSeverity);
    if (append && state.feedCursor) query.set("before", state.feedCursor);
    try {
      const data = await apiFetch(`/api/v1/admin/activity?${query}`);
      if (request !== state.feedRequest) return;
      const fresh = data.highlights.filter(
        (e) => e.unread && state.eventVersions.get(e.id) !== e.timestamp,
      );
      if (state.feedLoaded && !append && fresh.length) {
        const message =
          fresh.length === 1
            ? fresh[0].title
            : `${(globalThis.SnaapI18n?.text("มี ") ?? "มี ")}${fresh.length}${(globalThis.SnaapI18n?.text(" เหตุการณ์ใหม่ · ") ?? " เหตุการณ์ใหม่ · ")}${fresh[0].title}`;
        showToast(message);
        if (
          state.deviceNotifications &&
          "Notification" in window &&
          Notification.permission === "granted"
        ) {
          try {
            const notification = new Notification("SNAAP Admin", {
              body: message,
              tag: "snaap-admin-events",
            });
            notification.onclick = () => {
              window.focus();
              $('[data-tab="activity"]').click();
              notification.close();
            };
          } catch {
            /* In-page alerts stay available if the OS rejects notifications. */
          }
        }
      }
      for (const e of [...data.highlights, ...data.events])
        state.eventVersions.set(e.id, e.timestamp);
      if (state.eventVersions.size > 500)
        state.eventVersions = new Map([...state.eventVersions].slice(-250));
      state.feedLoaded = true;
      if (!background || state.activity.events.length <= 50)
        state.feedCursor = data.nextCursor;
      if (append) data.events = [...state.activity.events, ...data.events];
      else if (background && state.activity.events.length > 50) {
        const combined = new Map(state.activity.events.map((e) => [e.id, e]));
        for (const e of data.events) combined.set(e.id, e);
        data.events = [...combined.values()].sort(
          (a, b) => new Date(b.timestamp) - new Date(a.timestamp),
        );
      }
      state.activity = data;
      $("#connection-status").className = "connection-status";
      $("#connection-status").textContent =
        `${(globalThis.SnaapI18n?.text("อัปเดตล่าสุด ") ?? "อัปเดตล่าสุด ")}${new Date(data.checkedAt).toLocaleTimeString((globalThis.SnaapI18n?.locale ?? "th-TH"), { timeZone: "Asia/Bangkok" })}${(globalThis.SnaapI18n?.text(" · ตรวจทุก 15 วินาที") ?? " · ตรวจทุก 15 วินาที")}`;
      $("#incident-banner").hidden = !data.summary.openIncidents;
      $("#incident-banner").textContent =
        `${(globalThis.SnaapI18n?.text("มี ") ?? "มี ")}${data.summary.openIncidents}${(globalThis.SnaapI18n?.text(" เหตุขัดข้องที่ยังไม่กู้คืน · ") ?? " เหตุขัดข้องที่ยังไม่กู้คืน · ")}${data.activeIncidents.map((e) => e.title).join(" · ")}`;
      $("#btn-feed-more").hidden = !state.feedCursor;
      renderTodayBanner(data);
      renderActivity(data);
    } catch (err) {
      $("#connection-status").className = "connection-status is-error";
      $("#connection-status").textContent =
        (globalThis.SnaapI18n?.text("ติดต่อระบบไม่ได้ · ข้อมูลที่แสดงอาจเก่า กำลังลองเชื่อมต่อใหม่") ?? "ติดต่อระบบไม่ได้ · ข้อมูลที่แสดงอาจเก่า กำลังลองเชื่อมต่อใหม่");
      if (!state.feedLoaded)
        $("#activity-timeline-list").textContent =
          (globalThis.SnaapI18n?.text("โหลดเหตุการณ์ไม่สำเร็จ กดอัปเดตเพื่อลองอีกครั้ง") ?? "โหลดเหตุการณ์ไม่สำเร็จ กดอัปเดตเพื่อลองอีกครั้ง");
    }
  }

  function renderTodayBanner(data) {
    const { summary } = data;
    const events = data.highlights || data.events;
    const summaryText = $("#today-summary-text");
    if (summaryText) {
      summaryText.textContent = `${(globalThis.SnaapI18n?.text("วันนี้: สมาชิกใหม่ +") ?? "วันนี้: สมาชิกใหม่ +")}${summary.todaySignups}${(globalThis.SnaapI18n?.text(" คน · ปัญหาตลาด/ระบบ ") ?? " คน · ปัญหาตลาด/ระบบ ")}${summary.todayIncidents}${(globalThis.SnaapI18n?.text(" ครั้ง · ยอดชำระเงิน ") ?? " ครั้ง · ยอดชำระเงิน ")}${summary.todayPayments}${(globalThis.SnaapI18n?.text(" รายการ") ?? " รายการ")}`;
    }

    const badge = $("#tab-activity-badge");
    if (badge) {
      if (summary.unread > 0) {
        badge.textContent = summary.unread;
        badge.className = "badge badge-danger";
        badge.hidden = false;
      } else {
        badge.hidden = true;
      }
    }

    const previewList = $("#today-feed-preview");
    if (!previewList) return;

    if (!events || events.length === 0) {
      previewList.innerHTML = (globalThis.SnaapI18n?.text("<div style=\"font-size:13px;color:var(--tertiary);padding:4px 0;\">ยังไม่มีเหตุการณ์ในช่วงนี้ ✨</div>") ?? "<div style=\"font-size:13px;color:var(--tertiary);padding:4px 0;\">ยังไม่มีเหตุการณ์ในช่วงนี้ ✨</div>");
      return;
    }

    const top3 = events.slice(0, 3);
    previewList.innerHTML = top3
      .map((e) => {
        let badgeClass = "badge-free";
        if (e.severity === "error") badgeClass = "badge-danger";
        else if (e.severity === "warning") badgeClass = "badge-warning";
        else if (e.severity === "success") badgeClass = "badge-success";
        else if (e.severity === "info") badgeClass = "badge-pro";

        return `
          <div class="today-feed-item">
            <div class="today-feed-item-left">
              <span>${getCategoryIcon(e.category)}</span>
              <strong>${escapeHTML(e.title)}</strong>
              <span style="color:var(--secondary);font-size:12px;">${escapeHTML(e.detail)}</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <span class="badge ${badgeClass}" style="font-size:11px;">${formatTimeAgo(e.timestamp)}</span>
            </div>
          </div>
        `;
      })
      .join("");
  }

  function renderActivity(data) {
    const { summary, events } = data;

    // Counters
    if ($("#cnt-today-signups"))
      $("#cnt-today-signups").textContent = summary.todaySignups || 0;
    if ($("#cnt-today-incidents"))
      $("#cnt-today-incidents").textContent = summary.todayIncidents || 0;
    if ($("#cnt-today-deliveries")) {
      const todayFailed = summary.todayDeliveries || 0;
      $("#cnt-today-deliveries").textContent = todayFailed;
    }
    if ($("#cnt-today-payments"))
      $("#cnt-today-payments").textContent = summary.todayPayments || 0;

    const list = $("#activity-timeline-list");
    if (!list) return;

    let filtered = events || [];
    if (state.feedFilter !== "all") {
      filtered = filtered.filter((e) => e.category === state.feedFilter);
    }

    if (filtered.length === 0) {
      list.innerHTML = (globalThis.SnaapI18n?.text("<div class=\"empty-state\">ไม่มีเหตุการณ์ในหมวดนี้ ✨</div>") ?? "<div class=\"empty-state\">ไม่มีเหตุการณ์ในหมวดนี้ ✨</div>");
      return;
    }

    list.innerHTML = filtered
      .map(
        (e) => `
        <div class="timeline-card severity-${escapeHTML(e.severity)} ${e.unread ? "is-unread" : ""}">
          <div class="timeline-icon-box">${getCategoryIcon(e.category)}</div>
          <div class="timeline-body">
            <div class="timeline-header">
              <span class="timeline-title">${escapeHTML(e.title)}</span>
              <span class="timeline-time">${formatDate(e.timestamp)} (${formatTimeAgo(e.timestamp)})</span>
            </div>
            <div class="timeline-detail">${escapeHTML(e.detail)}</div>
            <div class="event-meta">
              <span class="badge ${e.status === "open" ? "badge-danger" : "badge-success"}">${e.status === "open" ? (globalThis.SnaapI18n?.text("กำลังขัดข้อง") ?? "กำลังขัดข้อง") : ["market", "system", "delivery"].includes(e.category) ? (globalThis.SnaapI18n?.text("กู้คืนแล้ว") ?? "กู้คืนแล้ว") : (globalThis.SnaapI18n?.text("บันทึกแล้ว") ?? "บันทึกแล้ว")}</span>
              <span>${{ error: (globalThis.SnaapI18n?.text("รุนแรง") ?? "รุนแรง"), warning: (globalThis.SnaapI18n?.text("ควรตรวจสอบ") ?? "ควรตรวจสอบ"), info: (globalThis.SnaapI18n?.text("ข้อมูล") ?? "ข้อมูล"), success: (globalThis.SnaapI18n?.text("สำเร็จ") ?? "สำเร็จ") }[e.severity] || (globalThis.SnaapI18n?.text("ข้อมูล") ?? "ข้อมูล")}${(globalThis.SnaapI18n?.text("</span>\n              <span>เกิด ") ?? "</span>\n              <span>เกิด ")}${Number(e.occurrences)}${(globalThis.SnaapI18n?.text(" ครั้ง · เริ่ม ") ?? " ครั้ง · เริ่ม ")}${formatDate(e.created_at)}</span>
              ${e.unread ? `<button class="btn btn-sm" data-ack="${escapeHTML(e.id)}${(globalThis.SnaapI18n?.text("\">รับทราบ</button>") ?? "\">รับทราบ</button>")}` : (globalThis.SnaapI18n?.text("<span>รับทราบแล้ว</span>") ?? "<span>รับทราบแล้ว</span>")}
              ${e.metadata?.ruleId ? `<span>Rule ${escapeHTML(e.metadata.ruleId)}</span>` : ""}
              ${e.metadata?.runId ? `<span>Run ${escapeHTML(e.metadata.runId)}</span>` : ""}
            </div>
          </div>
        </div>
      `,
      )
      .join("");
  }

  // Load Users Data
  async function loadUsers(append = false) {
    const request = ++state.userRequest;
    if (!state.users.length && !append) $("#users-tbody").innerHTML = '<tr><td colspan="6">'+skeletonUI('rows', (globalThis.SnaapI18n?.text("กำลังโหลดผู้ใช้…") ?? "กำลังโหลดผู้ใช้…"))+'</td></tr>';
    const query = new URLSearchParams({
      search: state.search,
      filter: state.filter,
    });
    if (append && state.userCursor) query.set("before", state.userCursor);
    try {
      const data = await apiFetch(`/api/v1/admin/users?${query}`);
      if (request !== state.userRequest) return;
      state.users = append ? [...state.users, ...data.users] : data.users || [];
      state.usagePolicy = data.policy;
      state.userCursor = data.nextCursor;
      $("#btn-users-more").hidden = !data.nextCursor;
      renderUsers();
    } catch (err) {
      console.error("Load users error", err);
      showToast((globalThis.SnaapI18n?.text("โหลดรายชื่อผู้ใช้ไม่สำเร็จ") ?? "โหลดรายชื่อผู้ใช้ไม่สำเร็จ"));
      if (!state.users.length)
        $("#users-tbody").innerHTML =
          (globalThis.SnaapI18n?.text("<tr><td colspan=\"6\" class=\"empty-state\">โหลดรายชื่อไม่สำเร็จ กดรีเฟรชเพื่อลองอีกครั้ง</td></tr>") ?? "<tr><td colspan=\"6\" class=\"empty-state\">โหลดรายชื่อไม่สำเร็จ กดรีเฟรชเพื่อลองอีกครั้ง</td></tr>");
    }
  }

  function renderUsers() {
    const tbody = $("#users-tbody");
    let filtered = state.users;

    // Filter by tab
    if (state.filter === "pro") {
      filtered = filtered.filter((u) => u.is_pro);
    } else if (state.filter === "free") {
      filtered = filtered.filter((u) => !u.is_pro && !u.isAdmin);
    } else if (state.filter === "admin") {
      filtered = filtered.filter((u) => u.isAdmin);
    }

    // Filter by search
    if (state.search.trim()) {
      const q = state.search.trim().toLowerCase();
      filtered = filtered.filter(
        (u) =>
          (u.email && u.email.toLowerCase().includes(q)) ||
          u.id.toLowerCase().includes(q),
      );
    }

    if (filtered.length === 0) {
      tbody.innerHTML = (globalThis.SnaapI18n?.text("<tr><td colspan=\"6\" class=\"empty-state\">ไม่พบผู้ใช้ที่ค้นหา</td></tr>") ?? "<tr><td colspan=\"6\" class=\"empty-state\">ไม่พบผู้ใช้ที่ค้นหา</td></tr>");
      return;
    }

    tbody.innerHTML = filtered
      .map((u) => {
        let planBadge = `<span class="badge badge-free">Free</span>`;
        if (u.isAdmin) {
          planBadge = `<span class="badge badge-admin">👑 Admin</span>`;
        } else if (u.is_pro) {
          const rel = formatRelativeDays(u.pro_until);
          planBadge = `<span class="badge badge-pro">⭐ Pro (${rel})</span>`;
        }

        return `
        <tr>
          <td>
            <div class="user-cell">
              <span class="user-email" title="${escapeHTML(u.email || (globalThis.SnaapI18n?.text("ไม่ระบุอีเมล") ?? "ไม่ระบุอีเมล"))}">${escapeHTML(u.email || (globalThis.SnaapI18n?.text("ไม่ระบุอีเมล") ?? "ไม่ระบุอีเมล"))}</span>
              <button class="user-id btn btn-sm" data-copy="${escapeHTML(u.id)}${(globalThis.SnaapI18n?.text("\" title=\"คัดลอก User ID\">\n                ") ?? "\" title=\"คัดลอก User ID\">\n                ")}${u.id.slice(0, 8)}...${u.id.slice(-4)} 📋
              </button>
            </div>
          </td>
          <td>${planBadge}${(globalThis.SnaapI18n?.text("</td>\n          <td>\n            <div class=\"user-setup-summary\"><span>ทั้งหมด <strong>") ?? "</td>\n          <td>\n            <div class=\"user-setup-summary\"><span>ทั้งหมด <strong>")}${u.rules_count}${(globalThis.SnaapI18n?.text("</strong></span><span>เปิดอยู่ <strong>") ?? "</strong></span><span>เปิดอยู่ <strong>")}${u.active_rules_count}${(globalThis.SnaapI18n?.text("</strong></span></div>\n            <div class=\"user-row-meta\"><span>สัญญาณ ") ?? "</strong></span></div>\n            <div class=\"user-row-meta\"><span>สัญญาณ ")}${Number(u.signals_count ?? 0)}${(globalThis.SnaapI18n?.text("</span><span>แจ้งเตือน ") ?? "</span><span>แจ้งเตือน ")}${Number(u.notifications_sent ?? 0)}</span></div>
          </td>
          <td>
            <div class="user-ai-summary">AI <strong>${u.ai_standard_used}${(globalThis.SnaapI18n?.text("</strong> ครั้ง · ") ?? "</strong> ครั้ง · ")}${(globalThis.SnaapI18n?.text("เพดาน ") ?? "เพดาน ") + (state.usagePolicy?.[state.usagePolicy?.mode === "plans" ? (u.is_pro ? "pro" : "free") : "unified"]?.standard ?? (globalThis.SnaapI18n?.text("ไม่จำกัด") ?? "ไม่จำกัด"))}${(globalThis.SnaapI18n?.text("</div>\n            <div class=\"user-row-meta\"><span title=\"ต้นทุน AI โดยประมาณ\">USD ") ?? "</div>\n            <div class=\"user-row-meta\"><span title=\"ต้นทุน AI โดยประมาณ\">USD ")}${Number(u.ai_estimated_usd ?? 0).toFixed(4)}${(globalThis.SnaapI18n?.text("</span><span>ล้มเหลว ") ?? "</span><span>ล้มเหลว ")}${Number(u.ai_failed_count ?? 0)}</span></div>
          </td>
          <td>${formatDate(u.created_at)}</td>
          <td style="text-align: right;">
            <div class="user-actions">
              <div class="user-actions-row">
              <button class="btn btn-sm btn-primary" data-action="plan" data-user="${escapeHTML(u.id)}${(globalThis.SnaapI18n?.text("\">\n                ปรับสิทธิ์\n              </button>\n              <button class=\"btn btn-sm\" data-action=\"usage-report\" data-user=\"") ?? "\">\n                ปรับสิทธิ์\n              </button>\n              <button class=\"btn btn-sm\" data-action=\"usage-report\" data-user=\"")}${escapeHTML(u.id)}${(globalThis.SnaapI18n?.text("\" aria-expanded=\"false\">การใช้งาน</button>\n              ") ?? "\" aria-expanded=\"false\">การใช้งาน</button>\n              ")}${u.isAdmin ? '' : `<button class="btn btn-sm" data-action="restriction" data-user="${escapeHTML(u.id)}" data-email="${escapeHTML(u.email)}">${u.restriction_active ? (globalThis.SnaapI18n?.text("⏸ ระงับอยู่") ?? "⏸ ระงับอยู่") : (globalThis.SnaapI18n?.text("ควบคุม") ?? "ควบคุม")}</button>`}
              </div>
              <div class="user-actions-row">
              <button class="btn btn-sm" data-action="reset-quota" data-user="${escapeHTML(u.id)}${(globalThis.SnaapI18n?.text("\" title=\"คืนโควตา AI เดือนนี้ โดยเก็บประวัติการใช้\">\n                🧹 คืนโควตา AI\n              </button>\n              <button class=\"btn btn-sm\" data-action=\"impersonate\" data-user=\"") ?? "\" title=\"คืนโควตา AI เดือนนี้ โดยเก็บประวัติการใช้\">\n                🧹 คืนโควตา AI\n              </button>\n              <button class=\"btn btn-sm\" data-action=\"impersonate\" data-user=\"")}${escapeHTML(u.id)}${(globalThis.SnaapI18n?.text("\" title=\"เข้าสู่บัญชีผู้ใช้เพื่อช่วยตรวจสอบ 15 นาที\" ") ?? "\" title=\"เข้าสู่บัญชีผู้ใช้เพื่อช่วยตรวจสอบ 15 นาที\" ")}${u.isAdmin ? "disabled" : ""}${(globalThis.SnaapI18n?.text(">\n                👁️ สวมรอย\n              </button>\n              </div>\n            </div>\n          </td>\n        </tr>\n      ") ?? ">\n                👁️ สวมรอย\n              </button>\n              </div>\n            </div>\n          </td>\n        </tr>\n      ")}`;
      })
      .join("");
  }

  // Load Diagnostics
  async function loadDiagnostics() {
    if (!state.diagnostics) {
      $("#failed-deliveries-tbody").innerHTML = '<tr><td colspan="4">'+skeletonUI('rows', (globalThis.SnaapI18n?.text("กำลังโหลดรายการส่งที่ล้มเหลว…") ?? "กำลังโหลดรายการส่งที่ล้มเหลว…"))+'</td></tr>';
      $("#market-issues-tbody").innerHTML = '<tr><td colspan="5">'+skeletonUI('rows', (globalThis.SnaapI18n?.text("กำลังโหลดสถานะตลาด…") ?? "กำลังโหลดสถานะตลาด…"))+'</td></tr>';
      $("#system-logs-box").innerHTML = skeletonUI('rows', (globalThis.SnaapI18n?.text("กำลังโหลดบันทึกระบบ…") ?? "กำลังโหลดบันทึกระบบ…"));
      $("#admin-audit-list").innerHTML = skeletonUI('rows', (globalThis.SnaapI18n?.text("กำลังโหลดบันทึกผู้ดูแล…") ?? "กำลังโหลดบันทึกผู้ดูแล…"));
    }
    try {
      const [data, audit] = await Promise.all([
        apiFetch("/api/v1/admin/diagnostics"),
        apiFetch("/api/v1/admin/audit"),
      ]);
      state.diagnostics = data;
      renderDiagnostics(data);
      $("#admin-audit-list").innerHTML =
        audit.entries
          .map(
            (e) =>
              `<div class="log-entry"><strong>${escapeHTML(e.action)}</strong><div>${escapeHTML(e.actor_email || e.actor_id)} → ${escapeHTML(e.subject_email || e.subject_id || (globalThis.SnaapI18n?.text("ระบบ") ?? "ระบบ"))}</div><small>${formatDate(e.created_at)}</small></div>`,
          )
          .join("") ||
        (globalThis.SnaapI18n?.text("<div class=\"empty-state\">ยังไม่มีการกระทำของผู้ดูแล</div>") ?? "<div class=\"empty-state\">ยังไม่มีการกระทำของผู้ดูแล</div>");
    } catch (err) {
      console.error("Diagnostics error", err);
      if (!state.diagnostics) {
        const failure=(globalThis.SnaapI18n?.text("โหลดข้อมูลไม่สำเร็จ กดรีเฟรชเพื่อลองอีกครั้ง") ?? "โหลดข้อมูลไม่สำเร็จ กดรีเฟรชเพื่อลองอีกครั้ง");
        $("#failed-deliveries-tbody").innerHTML='<tr><td colspan="4" class="empty-state">'+failure+'</td></tr>';
        $("#market-issues-tbody").innerHTML='<tr><td colspan="5" class="empty-state">'+failure+'</td></tr>';
        $("#system-logs-box").textContent=failure;
        $("#admin-audit-list").textContent=failure;
      }
      showToast((globalThis.SnaapI18n?.text("โหลด Diagnostics ไม่สำเร็จ") ?? "โหลด Diagnostics ไม่สำเร็จ"));
    }
  }

  function renderDiagnostics(data) {
    const { failedDeliveries, marketIssues, recentLogs } = data;

    // Failed Deliveries
    const delTbody = $("#failed-deliveries-tbody");
    if (!failedDeliveries || failedDeliveries.length === 0) {
      delTbody.innerHTML = (globalThis.SnaapI18n?.text("<tr><td colspan=\"4\" class=\"empty-state\">ไม่มีรายการแจ้งเตือนที่ล้มเหลว ✨</td></tr>") ?? "<tr><td colspan=\"4\" class=\"empty-state\">ไม่มีรายการแจ้งเตือนที่ล้มเหลว ✨</td></tr>");
    } else {
      delTbody.innerHTML = failedDeliveries
        .map(
          (d) => `
        <tr>
          <td>${formatDate(d.created_at)}</td>
          <td><span class="badge badge-free">${escapeHTML(d.kind || "-")}</span> ${escapeHTML(d.destination_name || "")}</td>
          <td><strong>${escapeHTML(d.pair || "-")}</strong> (${escapeHTML(d.exchange || "-")})</td>
          <td><span class="badge badge-danger">${escapeHTML(d.status)}</span> <span style="font-size:12px;color:var(--danger);">${escapeHTML(d.detail || (globalThis.SnaapI18n?.text("ไม่ระบุรายละเอียด") ?? "ไม่ระบุรายละเอียด"))}</span></td>
        </tr>
      `,
        )
        .join("");
    }

    // Market Issues
    const marketTbody = $("#market-issues-tbody");
    if (!marketIssues || marketIssues.length === 0) {
      marketTbody.innerHTML = (globalThis.SnaapI18n?.text("<tr><td colspan=\"5\" class=\"empty-state\">ข้อมูลตลาดทุกคู่ทำงานปกติสมบูรณ์ ✨</td></tr>") ?? "<tr><td colspan=\"5\" class=\"empty-state\">ข้อมูลตลาดทุกคู่ทำงานปกติสมบูรณ์ ✨</td></tr>");
    } else {
      marketTbody.innerHTML = marketIssues
        .map(
          (m) => `
        <tr>
          <td><strong>${escapeHTML(m.exchange)}</strong></td>
          <td>${escapeHTML(m.pair)}</td>
          <td><span class="badge badge-warning">${escapeHTML(m.status)}</span></td>
          <td>${escapeHTML(m.rule_name || "-")} <small style="color:var(--tertiary);">(${escapeHTML(m.owner_email || "-")})</small></td>
          <td>${formatDate(m.checked_at)}</td>
        </tr>
      `,
        )
        .join("");
    }

    // Recent Logs
    const logBox = $("#system-logs-box");
    if (!recentLogs || recentLogs.length === 0) {
      logBox.innerHTML = (globalThis.SnaapI18n?.text("<div class=\"empty-state\">ยังไม่มีบันทึก Error ล่าสุด ✨</div>") ?? "<div class=\"empty-state\">ยังไม่มีบันทึก Error ล่าสุด ✨</div>");
    } else {
      logBox.innerHTML = recentLogs
        .map(
          (l) => `
        <div class="log-entry">
          <div class="log-meta">
            <span class="badge ${l.statusCode && l.statusCode >= 500 ? "badge-danger" : "badge-warning"}">${escapeHTML(l.type)} (${l.statusCode || "-"})</span>
            <span>${formatDate(l.timestamp)}</span>
            ${l.method ? `<span>[${l.method} ${escapeHTML(l.url || "")}]</span>` : ""}
          </div>
          <div style="font-weight:600;margin-top:2px;">${escapeHTML(l.message)}</div>
          ${l.detail ? `<pre style="margin:4px 0 0;font-size:11px;color:var(--secondary);">${escapeHTML(JSON.stringify(l.detail, null, 2))}</pre>` : ""}
        </div>
      `,
        )
        .join("");
    }
  }

  async function action(button, task) {
    button.disabled = true;
    try {
      await task();
    } catch (err) {
      showToast(err.message || (globalThis.SnaapI18n?.text("ดำเนินการไม่สำเร็จ กรุณาลองใหม่") ?? "ดำเนินการไม่สำเร็จ กรุณาลองใหม่"));
    } finally {
      button.disabled = false;
    }
  }

  function closeModal() {
    if (state.planSaving) return;
    $("#plan-modal").hidden = true;
    state.modalTrigger?.focus();
  }

  function setupUserActions() {
    $("#btn-signout").addEventListener("click", (e) =>
      action(e.currentTarget, async () => {
        await apiFetch("/api/v1/auth/logout", { method: "POST", body: "{}" });
        window.location.href = "/admin/login";
      }),
    );
    $("#users-tbody").addEventListener("click", async (e) => {
      const copy = e.target.closest("[data-copy]");
      if (copy) {
        await navigator.clipboard
          .writeText(copy.dataset.copy)
          .then(() => showToast((globalThis.SnaapI18n?.text("คัดลอก User ID แล้ว") ?? "คัดลอก User ID แล้ว")))
          .catch(() => showToast((globalThis.SnaapI18n?.text("คัดลอกไม่สำเร็จ") ?? "คัดลอกไม่สำเร็จ")));
        return;
      }
      const button = e.target.closest("[data-action]");
      if (!button) return;
      const id = button.dataset.user;
      const user = state.users.find((u) => u.id === id);
      if (button.dataset.action === "plan") {
        state.selectedUserId = id;
        state.modalTrigger = button;
        $("#modal-user-desc").textContent = `${(globalThis.SnaapI18n?.text("ผู้ใช้: ") ?? "ผู้ใช้: ")}${user?.email || id}`;
        $("#plan-modal").hidden = false;
        $(".modal-option-btn").focus();
        return;
      }
      if (button.dataset.action === "reset-quota") {
        if (
          !confirm(
            (globalThis.SnaapI18n?.text("คืนโควตา AI เดือนนี้ให้ผู้ใช้? ประวัติ tokens และค่าใช้จ่ายจะยังเก็บอยู่") ?? "คืนโควตา AI เดือนนี้ให้ผู้ใช้? ประวัติ tokens และค่าใช้จ่ายจะยังเก็บอยู่"),
          )
        )
          return;
        await action(button, async () => {
          await apiFetch(`/api/v1/admin/users/${id}/reset-quota`, {
            method: "POST",
            body: "{}",
          });
          showToast((globalThis.SnaapI18n?.text("คืนโควตาแล้ว") ?? "คืนโควตาแล้ว"));
          await loadUsers();
        });
      } else if (button.dataset.action === "impersonate") {
        if (
          !confirm(
            `${(globalThis.SnaapI18n?.text("เข้าสู่บัญชี ") ?? "เข้าสู่บัญชี ")}${user?.email || id}${(globalThis.SnaapI18n?.text(" เพื่อช่วยตรวจสอบ? ระบบจะบันทึกการกระทำนี้") ?? " เพื่อช่วยตรวจสอบ? ระบบจะบันทึกการกระทำนี้")}`,
          )
        )
          return;
        await action(button, async () => {
          await apiFetch(`/api/v1/admin/users/${id}/impersonate`, {
            method: "POST",
            body: "{}",
          });
          window.location.href = "/";
        });
      }
    });
    $$(".modal-option-btn").forEach((button) =>
      button.addEventListener("click", async () => {
        if (state.planSaving) return;
        state.planSaving = true;
        $$("#plan-modal button").forEach((b) => (b.disabled = true));
        $("#plan-modal").setAttribute("aria-busy", "true");
        try {
          await apiFetch(`/api/v1/admin/users/${state.selectedUserId}/plan`, {
            method: "POST",
            body: JSON.stringify({ plan: button.dataset.plan }),
          });
          state.planSaving = false;
          closeModal();
          showToast((globalThis.SnaapI18n?.text("อัปเดตแพ็กเกจแล้ว") ?? "อัปเดตแพ็กเกจแล้ว"));
          await loadUsers();
          await loadOverview();
        } catch (err) {
          showToast(err.message || (globalThis.SnaapI18n?.text("อัปเดตแพ็กเกจไม่สำเร็จ กรุณาลองใหม่") ?? "อัปเดตแพ็กเกจไม่สำเร็จ กรุณาลองใหม่"));
        } finally {
          state.planSaving = false;
          $$("#plan-modal button").forEach((b) => (b.disabled = false));
          $("#plan-modal").removeAttribute("aria-busy");
          if (!$("#plan-modal").hidden) button.focus();
        }
      }),
    );
    $("#btn-modal-close").addEventListener("click", closeModal);
    $("#plan-modal").setAttribute("role", "dialog");
    $("#plan-modal").setAttribute("aria-modal", "true");
    $("#plan-modal").setAttribute("aria-label", (globalThis.SnaapI18n?.text("ปรับสิทธิ์แพ็กเกจ") ?? "ปรับสิทธิ์แพ็กเกจ"));
    $("#plan-modal").addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal();
      if (e.key === "Tab") {
        const buttons = $$("#plan-modal button:not(:disabled)");
        const first = buttons[0],
          last = buttons.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });
    let searchTimer;
    $("#user-search-input").addEventListener("input", (e) => {
      state.search = e.target.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => loadUsers(), 250);
    });
    $$("[data-filter]").forEach((button) =>
      button.addEventListener("click", () => {
        $$("[data-filter]").forEach((b) =>
          b.classList.toggle("active", b === button),
        );
        state.filter = button.dataset.filter;
        loadUsers();
      }),
    );
    $("#btn-users-more").addEventListener("click", (e) =>
      action(e.currentTarget, () => loadUsers(true)),
    );
    $("#btn-clear-logs").addEventListener("click", (e) => {
      if (
        confirm(
          (globalThis.SnaapI18n?.text("ล้าง Log ในหน่วยความจำ? ประวัติเหตุการณ์และการกระทำของ Admin ยังคงอยู่") ?? "ล้าง Log ในหน่วยความจำ? ประวัติเหตุการณ์และการกระทำของ Admin ยังคงอยู่"),
        )
      )
        action(e.currentTarget, async () => {
          await apiFetch("/api/v1/admin/logs/clear", {
            method: "POST",
            body: "{}",
          });
          await loadDiagnostics();
          showToast((globalThis.SnaapI18n?.text("ล้าง Log แล้ว") ?? "ล้าง Log แล้ว"));
        });
    });
    $$("[data-feed-filter]").forEach((button) =>
      button.addEventListener("click", () => {
        $$("[data-feed-filter]").forEach((b) =>
          b.classList.toggle("active", b === button),
        );
        state.feedFilter = button.dataset.feedFilter;
        loadActivity();
      }),
    );
    $("#feed-state").addEventListener("change", (e) => {
      state.feedState = e.target.value;
      loadActivity();
    });
    $("#feed-severity").addEventListener("change", (e) => {
      state.feedSeverity = e.target.value;
      loadActivity();
    });
    $("#btn-feed-more").addEventListener("click", (e) =>
      action(e.currentTarget, () => loadActivity(true)),
    );
    $("#btn-read-all").addEventListener("click", (e) =>
      action(e.currentTarget, async () => {
        if (!state.activity.checkedAt) return;
        await apiFetch("/api/v1/admin/activity/read-all", {
          method: "POST",
          body: JSON.stringify({ through: state.activity.checkedAt }),
        });
        await loadActivity();
      }),
    );
    $("#activity-timeline-list").addEventListener("click", (e) => {
      const button = e.target.closest("[data-ack]");
      if (button)
        action(button, async () => {
          await apiFetch(
            `/api/v1/admin/activity/${button.dataset.ack}/acknowledge`,
            { method: "POST", body: "{}" },
          );
          await loadActivity();
        });
    });
    $("#btn-refresh-feed").addEventListener("click", () => loadActivity());
    $("#btn-view-all-activity").addEventListener("click", () =>
      $("[data-tab='activity']").click(),
    );
    $("#btn-refresh").addEventListener("click", (e) =>
      action(e.currentTarget, async () => {
        await Promise.all([
          loadOverview(),
          loadActivity(),
          state.activeTab === "users" ? loadUsers() : Promise.resolve(),
          state.activeTab === "diagnostics"
            ? loadDiagnostics()
            : Promise.resolve(),
        ]);
      }),
    );
    $("#btn-notifications").addEventListener("click", (e) =>
      action(e.currentTarget, async () => {
        if (!("Notification" in window)) {
          showToast((globalThis.SnaapI18n?.text("เบราว์เซอร์นี้ไม่รองรับ ใช้แจ้งเตือนในหน้า Dashboard ได้") ?? "เบราว์เซอร์นี้ไม่รองรับ ใช้แจ้งเตือนในหน้า Dashboard ได้"));
          return;
        }
        if (state.deviceNotifications) {
          state.deviceNotifications = false;
          try {
            localStorage.setItem("snaap-admin-notifications", "off");
          } catch {}
          $("#btn-notifications").textContent = (globalThis.SnaapI18n?.text("เปิดแจ้งเตือนบนอุปกรณ์") ?? "เปิดแจ้งเตือนบนอุปกรณ์");
          showToast(
            (globalThis.SnaapI18n?.text("ปิดแจ้งเตือนบนอุปกรณ์แล้ว การแจ้งเตือนใน Dashboard ยังเปิดอยู่") ?? "ปิดแจ้งเตือนบนอุปกรณ์แล้ว การแจ้งเตือนใน Dashboard ยังเปิดอยู่"),
          );
          return;
        }
        const permission = await Notification.requestPermission();
        state.deviceNotifications = permission === "granted";
        try {
          localStorage.setItem(
            "snaap-admin-notifications",
            state.deviceNotifications ? "on" : "off",
          );
        } catch {}
        $("#btn-notifications").textContent =
          permission === "granted"
            ? (globalThis.SnaapI18n?.text("ปิดแจ้งเตือนบนอุปกรณ์") ?? "ปิดแจ้งเตือนบนอุปกรณ์")
            : (globalThis.SnaapI18n?.text("การแจ้งเตือนใน Dashboard เปิดอยู่") ?? "การแจ้งเตือนใน Dashboard เปิดอยู่");
        showToast(
          permission === "granted"
            ? (globalThis.SnaapI18n?.text("จะแจ้งเหตุการณ์ใหม่ระหว่างเปิด Dashboard") ?? "จะแจ้งเหตุการณ์ใหม่ระหว่างเปิด Dashboard")
            : (globalThis.SnaapI18n?.text("เปิดสิทธิ์แจ้งเตือนได้ในการตั้งค่าเบราว์เซอร์") ?? "เปิดสิทธิ์แจ้งเตือนได้ในการตั้งค่าเบราว์เซอร์"),
        );
      }),
    );
  }
  // Init
  document.addEventListener("DOMContentLoaded", () => {
    try {
      state.deviceNotifications =
        localStorage.getItem("snaap-admin-notifications") === "on";
    } catch {
      state.deviceNotifications = false;
    }
    if (state.deviceNotifications)
      $("#btn-notifications").textContent = (globalThis.SnaapI18n?.text("ปิดแจ้งเตือนบนอุปกรณ์") ?? "ปิดแจ้งเตือนบนอุปกรณ์");
    setupTabs();
    setupUserActions();
    loadOverview();
    loadActivity();

    // Both header health and the operations inbox remain live on every tab.
    const refreshLive = () => {
      loadActivity(false, true);
      loadOverview();
    };
    setInterval(() => {
      if (!document.hidden) refreshLive();
    }, 15000);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refreshLive();
    });
  });
})();
