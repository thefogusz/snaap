"use strict";
(() => {
  let scope = '', count = 0, generation = 0;
  const pendingReads = new Set(), acknowledged = new Set();
  const currentScope = () => `${state.me?.id ?? ''}:${state.workspaceId ?? ''}`;
  const isViewing = () => !document.hidden && document.hasFocus() &&
    !document.querySelector('#view-notifications').hidden && notificationSection === 'inbox';
  function paint() {
    const label = `สัญญาณที่ยังไม่ได้อ่าน ${count} รายการ`;
    const badge = document.querySelector('#nav-count');
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.hidden = count === 0;
    badge.setAttribute('aria-label', label);
    badge.title = label;
    const tab = document.querySelector('[data-notification-tab="inbox"]');
    tab?.querySelector('.notification-count')?.remove();
    if (tab && count) {
      const node = document.createElement('span');
      node.className = 'notification-count';
      node.textContent = count > 99 ? '99+' : String(count);
      node.setAttribute('aria-label', label);
      node.title = label;
      tab.append(node);
    }
  }
  async function read(through, expectedScope = currentScope()) {
    if (!through || expectedScope !== currentScope()) return;
    const key = `${expectedScope}:${through}`;
    if (pendingReads.has(key) || acknowledged.has(key)) return;
    pendingReads.add(key);
    ++generation;
    try {
      await api('/signals/read', 'POST', {through});
      acknowledged.add(key);
      if (expectedScope === currentScope()) await refresh();
    } catch { /* Keep unread state and retry on the next visit or inbox refresh. */ }
    finally { pendingReads.delete(key); }
  }
  async function refresh(clearOnEntry = false) {
    if (!state.me?.id || !state.workspaceId) return;
    const expectedScope = currentScope(), request = ++generation;
    if (scope !== expectedScope) { scope = expectedScope; count = 0; acknowledged.clear(); paint(); }
    try {
      const summary = await api('/signals/unread');
      if (expectedScope !== currentScope()) return;
      if (request === generation) {
        count = summary.count;
        paint();
      }
      if (clearOnEntry && !document.hidden && document.hasFocus() &&
          !document.querySelector('#view-notifications').hidden) await read(summary.latestId, expectedScope);
      else if (request === generation) markVisible();
    } catch { /* A failed request must not imply that signals have been read. */ }
  }
  function markVisible() {
    if (!isViewing() || !notificationData?.loaded || notificationWorkspace !== state.workspaceId) return;
    const latest = notificationData.signals.find(canDisplaySignal);
    if (latest) void read(latest.id);
  }
  window.SnaapSignalUnread = {refresh, enter: () => refresh(true), markVisible, paint, isViewing};
  window.addEventListener('snaap-account-ready', () => {
    void refresh(scope !== currentScope() && !document.querySelector('#view-notifications').hidden);
  });
  function resume() {
    if (document.hidden || !document.hasFocus()) return;
    void refresh();
    if (isViewing()) void renderNotifications();
  }
  window.addEventListener('focus', resume);
  document.addEventListener('visibilitychange', resume);
  paint();
})();
