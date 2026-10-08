(() => {
  'use strict';
  const { language, dictionary } = window.SnaapLanguage;
  const terms = /[\u0e00-\u0e7f]+(?:[ \t]+[\u0e00-\u0e7f]+)*/g;
  function text(source) {
    if (language === 'th') return source;
    const translated = source.replace(terms, (term, offset) => {
      const value = dictionary[term];
      if (!value) return term;
      return (/[A-Za-z0-9]/.test(source[offset - 1] ?? '') ? ' ' : '') + value + (/[A-Za-z0-9]/.test(source[offset + term.length] ?? '') ? ' ' : '');
    });
    return translated;
  }
  window.SnaapI18n = { language, locale: language === 'th' ? 'th-TH' : 'en-US', text };
  document.documentElement.lang = language;
  document.addEventListener('DOMContentLoaded', () => {
    if (document.querySelector('.login-card')) return;
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'language-toggle';
    toggle.id = 'language-toggle';
    toggle.textContent = language === 'th' ? 'ไทย' : 'EN';
    toggle.setAttribute('aria-label', language === 'th' ? 'เปลี่ยนภาษาเป็นอังกฤษ' : 'Switch language to Thai');
    toggle.title = toggle.getAttribute('aria-label');
    toggle.setAttribute('aria-pressed', String(language === 'en'));
    toggle.addEventListener('click', () => {
      const next = language === 'th' ? 'en' : 'th';
      const changing = new CustomEvent('snaap:language-changing', { cancelable: true });
      if (!window.dispatchEvent(changing)) return;
      document.cookie = `snaap_language=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
      location.reload();
    });
    const navigation = document.querySelector('.navigation');
    if (navigation) {
      const actions = document.createElement('div');
      actions.className = 'language-navigation-actions';
      actions.append(navigation.querySelector('.nav-cta'), toggle);
      navigation.append(actions);
      return;
    }
    const container = document.querySelector('.topbar-actions') ?? document.querySelector('.legal-header, .admin-topbar, header');
    (container ?? document.body).insertBefore(toggle, container?.querySelector('.prototype-badge') ?? null);
  });
})();
