"use strict";
// Browser alerts work while this page is open. Server monitoring is independent.
(() => {
  let owner = null, preferences = { desktop: false, sound: false };
  let audio, cursor = null, baseline = false, busy = false, failed = false;
  const supported = () => window.isSecureContext && "Notification" in window;
  const storageKey = () => "snaap-alerts:" + owner;
  function save() {
    try { localStorage.setItem(storageKey(), JSON.stringify(preferences)); } catch {}
  }
  async function unlockAudio() {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) throw Error((globalThis.SnaapI18n?.text("เบราว์เซอร์นี้ไม่รองรับเสียงแจ้งเตือน") ?? "เบราว์เซอร์นี้ไม่รองรับเสียงแจ้งเตือน"));
    audio ??= new Context();
    await audio.resume();
    if (audio.state !== "running") throw Error((globalThis.SnaapI18n?.text("กดลองเสียงอีกครั้งเพื่อเปิดเสียง") ?? "กดลองเสียงอีกครั้งเพื่อเปิดเสียง"));
  }
  function chime() {
    if (!audio || audio.state !== "running") return false;
    [660, 880].forEach((frequency, index) => {
      const oscillator = audio.createOscillator(), gain = audio.createGain();
      const start = audio.currentTime + index * .16;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(.09, start + .015);
      gain.gain.exponentialRampToValueAtTime(.001, start + .24);
      oscillator.connect(gain); gain.connect(audio.destination);
      oscillator.start(start); oscillator.stop(start + .25);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    });
    return true;
  }
  function settingsMarkup() {
    const permission = supported() ? Notification.permission : "unsupported";
    const desktopOn = preferences.desktop && permission === "granted";
    const hints = [];
    if (permission === "denied") hints.push((globalThis.SnaapI18n?.text("Chrome บล็อกอยู่ · เปลี่ยนสิทธิ์ที่ไอคอนข้าง URL") ?? "Chrome บล็อกอยู่ · เปลี่ยนสิทธิ์ที่ไอคอนข้าง URL"));
    if (permission === "unsupported") hints.push((globalThis.SnaapI18n?.text("เบราว์เซอร์นี้ไม่รองรับแจ้งเตือนบนหน้าจอ") ?? "เบราว์เซอร์นี้ไม่รองรับแจ้งเตือนบนหน้าจอ"));
    if (preferences.sound && audio?.state !== "running") hints.push((globalThis.SnaapI18n?.text("กดลองเสียงเพื่อเปิดเสียงในรอบนี้") ?? "กดลองเสียงเพื่อเปิดเสียงในรอบนี้"));
    if (failed) hints.push((globalThis.SnaapI18n?.text("เชื่อมต่อขาด กำลังลองใหม่") ?? "เชื่อมต่อขาด กำลังลองใหม่"));
    return `${(globalThis.SnaapI18n?.text("<section class=\"browser-alert-settings\" aria-label=\"การแจ้งเตือนในเบราว์เซอร์\"><span class=\"browser-alert-label\" title=\"รับสัญญาณทุกเวิร์กสเปซขณะเปิดเว็บ · ปิดเว็บแล้วใช้ช่องทางที่เชื่อมไว้\">ในเบราว์เซอร์ <small>ขณะเปิดเว็บ</small></span><div class=\"browser-alert-actions\"><button type=\"button\" class=\"browser-alert-toggle\" data-browser-alert=\"desktop\" aria-pressed=\"") ?? "<section class=\"browser-alert-settings\" aria-label=\"การแจ้งเตือนในเบราว์เซอร์\"><span class=\"browser-alert-label\" title=\"รับสัญญาณทุกเวิร์กสเปซขณะเปิดเว็บ · ปิดเว็บแล้วใช้ช่องทางที่เชื่อมไว้\">ในเบราว์เซอร์ <small>ขณะเปิดเว็บ</small></span><div class=\"browser-alert-actions\"><button type=\"button\" class=\"browser-alert-toggle\" data-browser-alert=\"desktop\" aria-pressed=\"")}${desktopOn}" ${["denied", "unsupported"].includes(permission) ? "disabled" : ""}${(globalThis.SnaapI18n?.text("><span aria-hidden=\"true\" class=\"browser-alert-dot\"></span>แจ้งเตือน</button><button type=\"button\" class=\"browser-alert-toggle\" data-browser-alert=\"sound\" aria-pressed=\"") ?? "><span aria-hidden=\"true\" class=\"browser-alert-dot\"></span>แจ้งเตือน</button><button type=\"button\" class=\"browser-alert-toggle\" data-browser-alert=\"sound\" aria-pressed=\"")}${preferences.sound}${(globalThis.SnaapI18n?.text("\"><span aria-hidden=\"true\" class=\"browser-alert-dot\"></span>เสียง</button><button type=\"button\" class=\"browser-alert-preview\" data-browser-alert=\"preview\">") ?? "\"><span aria-hidden=\"true\" class=\"browser-alert-dot\"></span>เสียง</button><button type=\"button\" class=\"browser-alert-preview\" data-browser-alert=\"preview\">")}${uiIcon("play")}${(globalThis.SnaapI18n?.text("ลองเสียง</button></div>") ?? "ลองเสียง</button></div>")}${hints.length ? `<p class="browser-alert-hint" role="status">${hints.join(" · ")}</p>` : ""}</section>`;
  }
  function repaint() {
    const markup = settingsMarkup();
    document.querySelectorAll("[data-browser-alert-slot]").forEach(slot => {
      if (slot.dataset.alertMarkup === markup) return;
      const focused = slot.contains(document.activeElement) ? document.activeElement.dataset.browserAlert : null;
      if (slot.querySelector(".browser-alert-settings")) {
        // Keep the controls mounted so CSS can animate between their states.
        const template = document.createElement("template");
        template.innerHTML = markup;
        template.content.querySelectorAll("[data-browser-alert]").forEach(next => {
          const current = slot.querySelector(`[data-browser-alert="${next.dataset.browserAlert}"]`);
          if (!current) return;
          if (next.hasAttribute("aria-pressed")) current.setAttribute("aria-pressed", next.getAttribute("aria-pressed"));
          current.disabled = next.disabled;
        });
        const hint = slot.querySelector(".browser-alert-hint");
        const nextHint = template.content.querySelector(".browser-alert-hint");
        if (hint && nextHint) hint.textContent = nextHint.textContent;
        else if (hint) hint.remove();
        else if (nextHint) slot.querySelector(".browser-alert-settings").append(nextHint);
      } else slot.innerHTML = markup;
      slot.dataset.alertMarkup = markup;
      if (focused) slot.querySelector(`[data-browser-alert="${focused}"]`)?.focus({ preventScroll: true });
    });
  }
  async function getSignals(query = "") {
    // Deliberately omit the workspace header: watch every workspace of this user.
    const response = await fetch("/api/v1/signals?view=signals" + (query ? '&'+query.slice(1) : ''));
    if (!response.ok) throw Error("Signal connection unavailable");
    return response.json();
  }
  async function poll() {
    if (busy || !state.me?.id) return;
    // A hidden tab only needs to keep polling when it can raise a desktop or sound alert;
    // otherwise focus/visibility catches up with the saved cursor.
    if (document.hidden && baseline && owner === state.me.id && !(preferences.desktop || preferences.sound)) return;
    busy = true;
    let changed = false;
    try {
      if (owner !== state.me.id) {
        owner = state.me.id; cursor = null; baseline = false;
        preferences = { desktop: false, sound: false };
        try {
          const stored = JSON.parse(localStorage.getItem(storageKey()) || "{}");
          preferences = { desktop: stored.desktop === true, sound: stored.sound === true };
        } catch {}
      }
      const rows = await getSignals(cursor ? "?after=" + encodeURIComponent(cursor) : "");
      if (!baseline) {
        cursor = rows[0]?.id ?? null; baseline = true; changed = true;
      } else {
        // With no prior signal the endpoint is newest-first; otherwise it is oldest-first.
        const fresh = cursor ? rows : rows.slice().reverse();
        // Drain bursts from setups covering many pairs instead of falling 100 signals behind per poll.
        if (cursor) {
          let page = rows;
          for (let count = 1; page.length === 100 && count < 10; count++) {
            page = await getSignals("?after=" + encodeURIComponent(page.at(-1).id));
            fresh.push(...page);
          }
        }
        if (fresh.length) {
          changed = true;
          cursor = fresh.at(-1).id;
          const last = fresh.at(-1);
          const kind = { ENTRY: (globalThis.SnaapI18n?.text("สัญญาณเข้า") ?? "สัญญาณเข้า"), EXIT: (globalThis.SnaapI18n?.text("สัญญาณออก") ?? "สัญญาณออก"), CANCEL: (globalThis.SnaapI18n?.text("ยกเลิก") ?? "ยกเลิก"), EXPIRED: (globalThis.SnaapI18n?.text("หมดเวลารอ") ?? "หมดเวลารอ") }[last.event.kind] || (globalThis.SnaapI18n?.text("สัญญาณใหม่") ?? "สัญญาณใหม่");
          const text = fresh.length > 1 ? `${(globalThis.SnaapI18n?.text("มี ") ?? "มี ")}${fresh.length}${(globalThis.SnaapI18n?.text(" สัญญาณใหม่ · ") ?? " สัญญาณใหม่ · ")}${last.pair}` : `${kind} · ${last.pair} · ${last.setup_name || (globalThis.SnaapI18n?.text("เซ็ตอัพ") ?? "เซ็ตอัพ")}`;
          // Alerts watch every workspace; suppress only signals in the inbox being viewed.
          const viewingInbox = window.SnaapSignalUnread?.isViewing() &&
            fresh.every(row => state.rules.some(rule => rule.id === row.rule_id));
          if (!viewingInbox) toast(text);
          if (!viewingInbox && preferences.sound) chime();
          if (!viewingInbox && preferences.desktop && supported() && Notification.permission === "granted") {
            try {
              const notice = new Notification((globalThis.SnaapI18n?.text("Snaap · สัญญาณใหม่") ?? "Snaap · สัญญาณใหม่"), { body: text, tag: "snaap-signals", silent: true });
              notice.onclick = () => { window.focus(); notificationSection = 'inbox'; window.SnaapRouter.go("notifications"); navigate('notifications'); notice.close(); };
              setTimeout(() => notice.close(), 8000);
            } catch { /* Some mobile browsers require a service worker. Inbox still works. */ }
          }
          if (notificationData && ["notifications", "watch"].includes(window.SnaapRouter.current())) void renderNotifications();
        }
      }
      failed = false;
    } catch { failed = true; }
    // The unread badge refreshes itself on focus and visibility; poll only when signals moved.
    finally { busy = false; repaint(); if (changed) void window.SnaapSignalUnread?.refresh(); }
  }
  document.addEventListener("click", async event => {
    const button = event.target.closest("[data-browser-alert]");
    if (!button || !owner) return;
    button.disabled = true;
    try {
      if (button.dataset.browserAlert === "desktop") {
        if (preferences.desktop && Notification.permission === "granted") preferences.desktop = false;
        else if (supported()) {
          // Called directly from a click, never on page load.
          preferences.desktop = (await Notification.requestPermission()) === "granted";
        }
      } else if (button.dataset.browserAlert === "sound") {
        if (preferences.sound) preferences.sound = false;
        else { await unlockAudio(); preferences.sound = true; chime(); }
      } else { await unlockAudio(); chime(); }
      save(); repaint();
    } catch (error) { toast(error.message); }
    finally { button.disabled = false; }
  });
  // A saved sound preference needs a new user gesture after a reload.
  document.addEventListener("pointerdown", () => {
    if (preferences.sound) void unlockAudio().then(repaint).catch(() => {});
  });
  window.addEventListener("focus", () => { repaint(); void poll(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void poll(); });
  window.SnaapBrowserAlerts = { settingsMarkup };
  setInterval(poll, 15000);
  window.addEventListener("snaap-account-ready", () => { void poll(); });
})();
