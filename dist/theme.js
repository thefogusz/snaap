(() => {
  const key = 'snaap-color-theme';
  const root = document.documentElement;
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  let preference = null;
  try { const saved = localStorage.getItem(key); if (saved === 'light' || saved === 'dark') preference = saved; } catch {}
  function applyTheme(theme) {
    const dark = theme === 'dark';
    root.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#111113' : '#f8f9f5');
    const toggle = document.getElementById('theme-toggle');
    if (toggle) {
      toggle.setAttribute('aria-pressed', String(dark));
      toggle.title = dark ? (globalThis.SnaapI18n?.text("กลับเป็นโหมดสว่าง") ?? "กลับเป็นโหมดสว่าง") : (globalThis.SnaapI18n?.text("เปิดโหมดมืด") ?? "เปิดโหมดมืด");
    }
  }
  applyTheme(preference || (system.matches ? 'dark' : 'light'));
  document.addEventListener('DOMContentLoaded', () => {
    applyTheme(root.dataset.theme);
    document.getElementById('theme-toggle').addEventListener('click', () => {
      preference = root.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(key, preference); } catch {}
      applyTheme(preference);
    });
  });
  system.addEventListener('change', () => { if (!preference) applyTheme(system.matches ? 'dark' : 'light'); });
  window.addEventListener('storage', (event) => {
    if (event.key !== key && event.key !== null) return;
    preference = event.newValue === 'dark' || event.newValue === 'light' ? event.newValue : null;
    applyTheme(preference || (system.matches ? 'dark' : 'light'));
  });
})();
