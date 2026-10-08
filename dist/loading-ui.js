// Shared markup: no per-placeholder listeners, timers, or extra network reads.
function skeletonUI(kind = 'rows', label = 'กำลังโหลด…') {
  const line = '<i class="skeleton-line"></i>';
  const copy = '<div class="skeleton-copy">' + line + line + '</div>';
  const row = '<div class="skeleton-row"><i class="skeleton-icon"></i>' + copy + '</div>';
  const card = '<div class="skeleton-card">' + copy + '<i class="skeleton-block"></i>' + line + '</div>';
  const marketRow = '<div class="sf-loading-row">' + copy + '<i class="skeleton-block"></i></div>';
  const body = kind === 'chart'
    ? '<div class="skeleton-chart"><div class="skeleton-chart-bars">' + [36, 52, 43, 65, 58, 76, 62, 83, 70, 91, 78, 86].map(h => '<i style="height:' + h + '%"></i>').join('') + '</div><div class="skeleton-chart-axis">' + line + line + line + '</div></div>'
    : kind === 'history' ? '<div class="skeleton-history">' + card.repeat(3) + '</div>'
    : kind === 'chat' ? '<div class="skeleton-chat">' + copy + copy + '</div>'
    : kind === 'cards' ? '<div class="skeleton-cards">' + card.repeat(3) + '</div>'
    : kind === 'market-brief' ? '<div class="sf-loading"><div class="sb-title">' + copy + '</div><div class="sb-flow-stage"><div>' + copy + '<i class="skeleton-block"></i>' + line + '</div><div>' + marketRow.repeat(5) + '</div></div><div class="sb-prices"><div class="sb-price-grid">' + ('<div class="sb-price">' + copy + '<i class="skeleton-block"></i>' + line + '</div>').repeat(6) + '</div></div></div>'
    : kind === 'market-daily' ? '<div class="sf-loading"><div class="sd-intro">' + copy + '</div><div class="sd-overview"><div class="sd-chart-card">' + copy + '<i class="sf-loading-plot"></i>' + line + '</div><div class="sd-reading">' + card.repeat(3) + '</div></div><div class="sf-loading-assets">' + card.repeat(4) + '</div></div>'
    : kind === 'market-positioning' ? '<div class="sf-loading"><div class="sp-head">' + copy + '</div><div class="sp-leaders">' + card.repeat(2) + '</div><div class="sp-grid"><div class="sp-board">' + copy + marketRow.repeat(8) + '</div><div class="sp-detail">' + copy + '<i class="sf-loading-plot"></i>' + line + '</div></div></div>'
    : kind === 'market-specialists' ? '<div class="sf-loading sf-loading-specialists">' + card.repeat(2) + '<div class="sf-loading-score">' + copy + '<i class="skeleton-block"></i></div></div>'
    : row.repeat(3);
  // Callers supply fixed labels, but escape them so this helper is safe to reuse.
  const safeLabel = String(label).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  return '<div class="skeleton" role="status"><span class="sr-only">' + safeLabel + '</span><div aria-hidden="true">' + body + '</div></div>';
}

// One listener for the whole app. Pause CSS motion when the tab is hidden.
if (typeof document !== 'undefined' && document.addEventListener) {
  const syncLoadingMotion = () => document.documentElement.toggleAttribute('data-loading-paused', document.hidden);
  syncLoadingMotion();
  document.addEventListener('visibilitychange', syncLoadingMotion);
}
