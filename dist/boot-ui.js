// Runs in the head so the legacy HTML never flashes before recovery.
(() => {
  const root = document.documentElement;
  root.dataset.boot = 'loading';
  const fallback = setTimeout(() => fail((globalThis.SnaapI18n?.text("โหลดนานกว่าปกติ ลองอีกครั้งได้") ?? "โหลดนานกว่าปกติ ลองอีกครั้งได้")), 15000);
  function fail(message) {
    clearTimeout(fallback);
    const status = document.querySelector('[data-startup-message]');
    if (status) { status.textContent = message; status.classList.remove('sr-only'); }
    const retry = document.querySelector('[data-startup-retry]');
    if (retry) retry.hidden = false;
  }
  function finish() {
    clearTimeout(fallback);
    delete root.dataset.boot;
  }
  document.addEventListener('click', event => {
    if (event.target.closest('[data-startup-retry]')) location.reload();
  });
  window.SnaapBoot = { finish, fail };
})();
