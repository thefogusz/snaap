// Runs in the head so the legacy HTML never flashes before recovery.
(() => {
  const root = document.documentElement;
  root.dataset.boot = 'loading';
  const fallback = setTimeout(() => {
    finish();
    const status = document.querySelector('.runtime-status');
    if (status) {
      status.hidden = false;
      status.textContent = 'โหลดนานกว่าปกติ ลองรีเฟรชอีกครั้งหากหน้ายังไม่พร้อม';
    }
  }, 15000);
  function finish() {
    clearTimeout(fallback);
    delete root.dataset.boot;
  }
  window.SnaapBoot = { finish };
})();
