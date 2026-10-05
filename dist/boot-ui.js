// Runs in the head so the legacy HTML never flashes before recovery.
(() => {
  const root = document.documentElement;
  root.dataset.boot = 'loading';
  const fallback = setTimeout(() => fail('โหลดนานกว่าปกติ ลองอีกครั้งได้'), 15000);
  function fail(message) {
    clearTimeout(fallback);
    const status = document.querySelector('[data-startup-message]');
    if (status) status.textContent = message;
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
