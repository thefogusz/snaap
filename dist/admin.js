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
  };

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
      return d.toLocaleDateString("th-TH", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoString;
    }
  }

  function formatRelativeDays(isoString) {
    if (!isoString) return "";
    try {
      const d = new Date(isoString);
      if (d.getFullYear() > 2090) return "ตลอดชีพ";
      const now = new Date();
      const diffHours = Math.round((d.getTime() - now.getTime()) / (1000 * 3600));
      if (diffHours <= 0) return "หมดอายุแล้ว";
      if (diffHours < 24) return `เหลือ ${diffHours} ชม.`;
      const diffDays = Math.ceil(diffHours / 24);
      return `เหลือ ${diffDays} วัน`;
    } catch {
      return "";
    }
  }

  function formatTimeAgo(isoString) {
    if (!isoString) return "";
    try {
      const d = new Date(isoString);
      const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
      if (diffSec < 60) return "เมื่อสักครู่";
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`;
      const diffHour = Math.floor(diffMin / 60);
      if (diffHour < 24) return `${diffHour} ชั่วโมงที่แล้ว`;
      const diffDay = Math.floor(diffHour / 24);
      return `${diffDay} วันที่แล้ว`;
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
      ...options,
      headers: { ...defaultHeaders, ...(options.headers || {}) },
    });

    if (res.status === 401) {
      alert("กรุณาเข้าสู่ระบบก่อนเข้าใช้งานหน้าผู้ดูแลระบบ");
      window.location.href = "/login.html";
      throw new Error("UNAUTHENTICATED");
    }

    if (res.status === 403) {
      const err = await res.json().catch(() => ({}));
      alert("คุณไม่มีสิทธิ์เข้าถึงหน้านี้ (เฉพาะ Admin เท่านั้น)");
      window.location.href = "/";
      throw new Error(err.error?.message || "FORBIDDEN");
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || "คำขอล้มเหลว");
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
    try {
      const data = await apiFetch("/api/v1/admin/overview");
      state.overview = data;
      renderOverview(data);
    } catch (err) {
      console.error("Overview error", err);
      $("#system-status-pill").className = "badge badge-danger";
      $("#system-status-text").textContent = "เชื่อมต่อล้มเหลว";
    }
  }

  function renderOverview(data) {
    const { health, kpis, recentDeliveries } = data;

    // Header Status Pill
    const dbOk = health.database.status === "healthy";
    $("#system-status-pill").className = dbOk
      ? "badge badge-success"
      : "badge badge-danger";
    $("#system-status-text").textContent = dbOk
      ? `ระบบพร้อมใช้งาน (${health.database.latencyMs}ms)`
      : "Database ผิดปกติ";

    // KPIs
    $("#kpi-total-users").textContent = kpis.totalUsers;
    $("#kpi-pro-users").textContent = `${kpis.proUsers} บัญชี Pro (${kpis.adminUsers} Admin)`;
    $("#kpi-users-badge").textContent = `${kpis.totalUsers} บัญชี`;

    $("#kpi-active-rules").textContent = kpis.activeRules;
    $("#kpi-total-rules").textContent = `จากทั้งหมด ${kpis.totalRules} กฎ`;

    $("#kpi-signals-24h").textContent = kpis.signals24h;

    const del = kpis.deliveries24h;
    $("#kpi-deliveries-success").textContent = del.delivered;
    $("#kpi-deliveries-sub").textContent = `สำเร็จ ${del.delivered} / ล้มเหลว ${del.failed} / รอส่ง ${del.pending}`;
    $("#kpi-delivery-badge").className =
      del.failed > 0 ? "badge badge-danger" : "badge badge-success";
    $("#kpi-delivery-badge").textContent =
      del.failed > 0 ? `ล้มเหลว ${del.failed}` : "100% ปกติ";

    const ai = kpis.aiCallsMonth;
    $("#kpi-ai-total").textContent = ai.total;
    $("#kpi-ai-breakdown").textContent = `Standard: ${ai.standard} | Deep: ${ai.deep}`;

    // Health cards
    $("#health-db-desc").textContent = `ความเร็วการตอบสนอง ${health.database.latencyMs} ms`;
    $("#badge-health-db").className = dbOk ? "badge badge-success" : "badge badge-danger";
    $("#badge-health-db").textContent = dbOk ? "ปกติ" : "Error";

    $("#health-ai-desc").textContent = health.ai.configured
      ? `โมเดล: ${health.ai.standardModel} / ${health.ai.deepModel}`
      : "ยังไม่ได้ตั้งค่า API Key";
    $("#badge-health-ai").className = health.ai.configured ? "badge badge-success" : "badge badge-warning";
    $("#badge-health-ai").textContent = health.ai.configured ? "เชื่อมต่อแล้ว" : "ไม่ได้เชื่อม";

    $("#health-stripe-desc").textContent = health.billing.configured
      ? health.billing.liveEnabled
        ? "เปิดรับเงินจริง (Live Mode)"
        : "โหมดทดสอบ (Test Mode)"
      : "ยังไม่ได้เชื่อมต่อ Stripe";
    $("#badge-health-stripe").className = health.billing.configured ? "badge badge-success" : "badge badge-free";
    $("#badge-health-stripe").textContent = health.billing.configured ? "พร้อมใช้" : "ปิดอยู่";

    const channels = [];
    if (health.telegram.configured) channels.push("Telegram");
    if (health.line.configured) channels.push("LINE");
    $("#health-channels-desc").textContent = channels.length > 0
      ? `ช่องทางที่เปิด: ${channels.join(", ")}`
      : "ยังไม่ได้ระบุ Bot Credentials";
    $("#badge-health-channels").className = channels.length > 0 ? "badge badge-success" : "badge badge-free";
    $("#badge-health-channels").textContent = channels.length > 0 ? "เปิดใช้งาน" : "ไม่มี";

    const uptimeMins = Math.floor(health.uptimeSeconds / 60);
    $("#health-runtime-desc").textContent = `Uptime: ${uptimeMins} นาที | Memory: ${health.memoryMb} MB`;

    // Recent deliveries table
    const tbody = $("#recent-deliveries-tbody");
    if (!recentDeliveries || recentDeliveries.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty-state">ยังไม่มีการส่งข้อความแจ้งเตือนล่าสุด</td></tr>`;
      return;
    }

    tbody.innerHTML = recentDeliveries
      .map((d) => {
        let badgeClass = "badge-free";
        if (d.status === "DELIVERED") badgeClass = "badge-success";
        else if (d.status === "FAILED" || d.status === "AMBIGUOUS") badgeClass = "badge-danger";
        else if (d.status === "RETRY" || d.status === "PENDING") badgeClass = "badge-warning";

        return `
        <tr>
          <td>${formatDate(d.created_at)}</td>
          <td><span class="badge badge-free">${d.kind || "-"}</span> ${d.destination_name || ""}</td>
          <td><strong>${d.pair || "-"}</strong> <small style="color:var(--tertiary);">(${d.exchange || "-"})</small></td>
          <td><span class="badge ${badgeClass}">${d.status}</span></td>
          <td style="font-size:12px;color:var(--secondary);">${d.detail || "-"}</td>
        </tr>
      `;
      })
      .join("");
  }

  function getCategoryIcon(cat) {
    switch (cat) {
      case "signup": return "👤";
      case "market": return "⚠️";
      case "delivery": return "🚨";
      case "billing": return "💳";
      case "system": return "⚙️";
      default: return "🔔";
    }
  }

  function isToday(isoString) {
    if (!isoString) return false;
    const d = new Date(isoString);
    const now = new Date();
    return d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();
  }

  // Load Activity & Incident Feed
  async function loadActivity() {
    try {
      const data = await apiFetch("/api/v1/admin/activity");
      state.activity = data;
      renderTodayBanner(data);
      renderActivity(data);
    } catch (err) {
      console.error("Activity load error", err);
    }
  }

  function renderTodayBanner(data) {
    const { summary, events } = data;
    const summaryText = $("#today-summary-text");
    if (summaryText) {
      summaryText.textContent = `วันนี้: สมาชิกใหม่ +${summary.todaySignups} คน · ปัญหาตลาด/ระบบ ${summary.todayIncidents} ครั้ง · ยอดชำระเงิน ${summary.todayPayments} รายการ`;
    }

    const badge = $("#tab-activity-badge");
    if (badge) {
      if (summary.todayIncidents > 0) {
        badge.textContent = summary.todayIncidents;
        badge.className = "badge badge-danger";
        badge.hidden = false;
      } else if (summary.todaySignups > 0) {
        badge.textContent = summary.todaySignups;
        badge.className = "badge badge-pro";
        badge.hidden = false;
      } else {
        badge.hidden = true;
      }
    }

    const previewList = $("#today-feed-preview");
    if (!previewList) return;

    if (!events || events.length === 0) {
      previewList.innerHTML = `<div style="font-size:13px;color:var(--tertiary);padding:4px 0;">ยังไม่มีเหตุการณ์ใหม่ในรอบ 7 วันที่ผ่านมา ✨</div>`;
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
              <strong>${e.title}</strong>
              <span style="color:var(--secondary);font-size:12px;">${e.detail}</span>
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
    if ($("#cnt-today-signups")) $("#cnt-today-signups").textContent = summary.todaySignups || 0;
    if ($("#cnt-today-incidents")) $("#cnt-today-incidents").textContent = summary.todayIncidents || 0;
    if ($("#cnt-today-deliveries")) {
      const todayFailed = events.filter((e) => e.category === "delivery" && isToday(e.timestamp)).length;
      $("#cnt-today-deliveries").textContent = todayFailed;
    }
    if ($("#cnt-today-payments")) $("#cnt-today-payments").textContent = summary.todayPayments || 0;

    const list = $("#activity-timeline-list");
    if (!list) return;

    let filtered = events || [];
    if (state.feedFilter !== "all") {
      filtered = filtered.filter((e) => e.category === state.feedFilter);
    }

    if (filtered.length === 0) {
      list.innerHTML = `<div class="empty-state">ไม่มีเหตุการณ์ในหมวดนี้ ✨</div>`;
      return;
    }

    list.innerHTML = filtered
      .map((e) => `
        <div class="timeline-card severity-${e.severity}">
          <div class="timeline-icon-box">${getCategoryIcon(e.category)}</div>
          <div class="timeline-body">
            <div class="timeline-header">
              <span class="timeline-title">${e.title}</span>
              <span class="timeline-time">${formatDate(e.timestamp)} (${formatTimeAgo(e.timestamp)})</span>
            </div>
            <div class="timeline-detail">${e.detail}</div>
          </div>
        </div>
      `)
      .join("");
  }

  // Load Users Data
  async function loadUsers() {
    try {
      const data = await apiFetch("/api/v1/admin/users");
      state.users = data.users || [];
      renderUsers();
    } catch (err) {
      console.error("Load users error", err);
      showToast("โหลดรายชื่อผู้ใช้ไม่สำเร็จ");
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
      tbody.innerHTML = `<tr><td colspan="6" class="empty-state">ไม่พบผู้ใช้ที่ค้นหา</td></tr>`;
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
              <span class="user-email">${u.email || "ไม่ระบุอีเมล"}</span>
              <span class="user-id" data-copy="${u.id}" title="คลิกเพื่อคัดลอก ID">
                ${u.id.slice(0, 8)}...${u.id.slice(-4)} 📋
              </span>
            </div>
          </td>
          <td>${planBadge}</td>
          <td>
            <strong>${u.active_rules_count}</strong>
            <span style="color:var(--tertiary);"> / ${u.rules_count} กฎ</span>
          </td>
          <td>
            <div>Std: <strong>${u.ai_standard_used}</strong> / ${u.is_pro ? 100 : 20}</div>
            <div style="font-size:11px;color:var(--tertiary);">Deep: <strong>${u.ai_deep_used}</strong> / ${u.is_pro ? 10 : 0}</div>
          </td>
          <td>${formatDate(u.created_at)}</td>
          <td style="text-align: right;">
            <div class="actions-cell" style="justify-content: flex-end;">
              <button class="btn btn-sm btn-primary" data-action="plan" data-user="${u.id}">
                ปรับสิทธิ์
              </button>
              <button class="btn btn-sm" data-action="toggle-admin" data-user="${u.id}" data-role="${u.role}">
                ${u.role === "admin" ? "ถอน Admin" : "ตั้ง Admin"}
              </button>
              <button class="btn btn-sm" data-action="reset-quota" data-user="${u.id}" title="ล้างจำนวนการใช้ AI เดือนนี้">
                🧹 ล้างโควตา AI
              </button>
              <button class="btn btn-sm" data-action="impersonate" data-user="${u.id}" title="เข้าสู่ระบบเสมือนผู้ใช้นี้">
                👁️ สวมรอย
              </button>
            </div>
          </td>
        </tr>
      `;
      })
      .join("");
  }

  // Load Diagnostics
  async function loadDiagnostics() {
    try {
      const data = await apiFetch("/api/v1/admin/diagnostics");
      state.diagnostics = data;
      renderDiagnostics(data);
    } catch (err) {
      console.error("Diagnostics error", err);
      showToast("โหลด Diagnostics ไม่สำเร็จ");
    }
  }

  function renderDiagnostics(data) {
    const { failedDeliveries, marketIssues, recentLogs } = data;

    // Failed Deliveries
    const delTbody = $("#failed-deliveries-tbody");
    if (!failedDeliveries || failedDeliveries.length === 0) {
      delTbody.innerHTML = `<tr><td colspan="4" class="empty-state">ไม่มีรายการแจ้งเตือนที่ล้มเหลว ✨</td></tr>`;
    } else {
      delTbody.innerHTML = failedDeliveries
        .map(
          (d) => `
        <tr>
          <td>${formatDate(d.created_at)}</td>
          <td><span class="badge badge-free">${d.kind || "-"}</span> ${d.destination_name || ""}</td>
          <td><strong>${d.pair || "-"}</strong> (${d.exchange || "-"})</td>
          <td><span class="badge badge-danger">${d.status}</span> <span style="font-size:12px;color:var(--danger);">${d.detail || "ไม่ระบุรายละเอียด"}</span></td>
        </tr>
      `,
        )
        .join("");
    }

    // Market Issues
    const marketTbody = $("#market-issues-tbody");
    if (!marketIssues || marketIssues.length === 0) {
      marketTbody.innerHTML = `<tr><td colspan="5" class="empty-state">ข้อมูลตลาดทุกคู่ทำงานปกติสมบูรณ์ ✨</td></tr>`;
    } else {
      marketTbody.innerHTML = marketIssues
        .map(
          (m) => `
        <tr>
          <td><strong>${m.exchange}</strong></td>
          <td>${m.pair}</td>
          <td><span class="badge badge-warning">${m.status}</span></td>
          <td>${m.rule_name || "-"} <small style="color:var(--tertiary);">(${m.owner_email || "-"})</small></td>
          <td>${formatDate(m.checked_at)}</td>
        </tr>
      `,
        )
        .join("");
    }

    // Recent Logs
    const logBox = $("#system-logs-box");
    if (!recentLogs || recentLogs.length === 0) {
      logBox.innerHTML = `<div class="empty-state">ยังไม่มีบันทึก Error ล่าสุด ✨</div>`;
    } else {
      logBox.innerHTML = recentLogs
        .map(
          (l) => `
        <div class="log-entry">
          <div class="log-meta">
            <span class="badge ${l.statusCode && l.statusCode >= 500 ? "badge-danger" : "badge-warning"}">${l.type} (${l.statusCode || "-"})</span>
            <span>${formatDate(l.timestamp)}</span>
            ${l.method ? `<span>[${l.method} ${l.url || ""}]</span>` : ""}
          </div>
          <div style="font-weight:600;margin-top:2px;">${l.message}</div>
          ${l.detail ? `<pre style="margin:4px 0 0;font-size:11px;color:var(--secondary);">${JSON.stringify(l.detail, null, 2)}</pre>` : ""}
        </div>
      `,
        )
        .join("");
    }
  }

  // Event Listeners for User Actions
  function setupUserActions() {
    // Copy User ID
    $("#users-tbody").addEventListener("click", (e) => {
      const copyEl = e.target.closest("[data-copy]");
      if (copyEl) {
        const id = copyEl.dataset.copy;
        navigator.clipboard.writeText(id).then(() => {
          showToast(`คัดลอก User ID: ${id}`);
        });
        return;
      }

      // Open Plan Modal
      const planBtn = e.target.closest('[data-action="plan"]');
      if (planBtn) {
        state.selectedUserId = planBtn.dataset.user;
        const user = state.users.find((u) => u.id === state.selectedUserId);
        $("#modal-user-desc").textContent = `ผู้ใช้: ${user?.email || state.selectedUserId}`;
        $("#plan-modal").hidden = false;
        return;
      }

      // Toggle Admin
      const adminBtn = e.target.closest('[data-action="toggle-admin"]');
      if (adminBtn) {
        const userId = adminBtn.dataset.user;
        const currentRole = adminBtn.dataset.role;
        const nextRole = currentRole === "admin" ? "user" : "admin";
        const confirmMsg =
          nextRole === "admin"
            ? "ต้องการแต่งตั้งผู้ใช้นี้เป็น Admin หรือไม่?"
            : "ต้องการถอนสิทธิ์ Admin ของผู้ใช้นี้หรือไม่?";
        if (confirm(confirmMsg)) {
          apiFetch(`/api/v1/admin/users/${userId}/plan`, {
            method: "POST",
            body: JSON.stringify({ role: nextRole }),
          }).then(() => {
            showToast("อัปเดตสิทธิ์สำเร็จ");
            loadUsers();
          });
        }
        return;
      }

      // Reset AI Quota
      const resetBtn = e.target.closest('[data-action="reset-quota"]');
      if (resetBtn) {
        const userId = resetBtn.dataset.user;
        if (confirm("ต้องการล้างประวัติการใช้ AI ประจำเดือนของผู้ใช้นี้หรือไม่? (โควตาจะกลับมาเต็มทันที)")) {
          apiFetch(`/api/v1/admin/users/${userId}/reset-quota`, {
            method: "POST",
            body: JSON.stringify({}),
          }).then(() => {
            showToast("รีเซ็ตโควตา AI สำเร็จแล้ว");
            loadUsers();
          });
        }
        return;
      }

      // Impersonate
      const impBtn = e.target.closest('[data-action="impersonate"]');
      if (impBtn) {
        const userId = impBtn.dataset.user;
        const user = state.users.find((u) => u.id === userId);
        if (confirm(`ต้องการสวมรอยเข้าสู่ระบบเสมือน ${user?.email || userId} หรือไม่?`)) {
          apiFetch(`/api/v1/admin/users/${userId}/impersonate`, {
            method: "POST",
            body: JSON.stringify({}),
          }).then(() => {
            showToast("สวมรอยสำเร็จ กำลังพาไปหน้าหลัก...");
            setTimeout(() => {
              window.location.href = "/";
            }, 600);
          });
        }
        return;
      }
    });

    // Plan Modal Option Selection
    $$(".modal-option-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const plan = btn.dataset.plan;
        if (!state.selectedUserId) return;
        $("#plan-modal").hidden = true;

        apiFetch(`/api/v1/admin/users/${state.selectedUserId}/plan`, {
          method: "POST",
          body: JSON.stringify({ plan }),
        }).then(() => {
          showToast("ปรับสิทธิ์แพ็กเกจสำเร็จเรียบร้อย");
          loadUsers();
          loadOverview();
        });
      });
    });

    $("#btn-modal-close").addEventListener("click", () => {
      $("#plan-modal").hidden = true;
    });

    // Search and Filters
    $("#user-search-input").addEventListener("input", (e) => {
      state.search = e.target.value;
      renderUsers();
    });

    $$(".filter-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        $$(".filter-btn").forEach((b) => b.classList.toggle("active", b === btn));
        state.filter = btn.dataset.filter;
        renderUsers();
      });
    });

    // Clear logs
    $("#btn-clear-logs").addEventListener("click", () => {
      if (confirm("ต้องการล้างประวัติ Error ทั้งหมดหรือไม่?")) {
        apiFetch("/api/v1/admin/logs/clear", {
          method: "POST",
          body: JSON.stringify({}),
        }).then(() => {
          showToast("ล้างประวัติ Error เรียบร้อย");
          loadDiagnostics();
        });
      }
    });

    // Feed filters
    $$("[data-feed-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        $$("[data-feed-filter]").forEach((b) => b.classList.toggle("active", b === btn));
        state.feedFilter = btn.dataset.feedFilter;
        renderActivity(state.activity);
      });
    });

    $("#btn-refresh-feed")?.addEventListener("click", () => {
      showToast("อัปเดตศูนย์แจ้งเตือน...");
      loadActivity();
    });

    $("#btn-view-all-activity")?.addEventListener("click", () => {
      const tabBtn = $('[data-tab="activity"]');
      if (tabBtn) tabBtn.click();
    });

    // Refresh button
    $("#btn-refresh").addEventListener("click", () => {
      showToast("กำลังรีเฟรชข้อมูล...");
      loadOverview();
      loadActivity();
      if (state.activeTab === "users") loadUsers();
      if (state.activeTab === "diagnostics") loadDiagnostics();
    });
  }

  // Init
  document.addEventListener("DOMContentLoaded", () => {
    setupTabs();
    setupUserActions();
    loadOverview();
    loadActivity();

    // Auto-refresh overview & activity every 30s
    setInterval(() => {
      if (state.activeTab === "overview") {
        loadOverview();
        loadActivity();
      } else if (state.activeTab === "activity") {
        loadActivity();
      }
    }, 30000);
  });
})();
