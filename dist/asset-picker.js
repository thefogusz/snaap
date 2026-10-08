import { categories, exchanges, selectTargets, strategyTargets } from './asset-catalog.js';

const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const productLabel = row => row.product === 'tokenized_stock' ? 'โทเคนอ้างอิงหุ้น · Spot' : row.market === 'Spot' ? 'Spot' : row.category === 'crypto' ? 'Perpetual' : 'สัญญาอ้างอิง · Perpetual';

export function pickAssets({ spec, api, maxPairs = 10, current = () => true }) {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog');
    dialog.className = 'asset-dialog';
    dialog.setAttribute('aria-labelledby', 'asset-dialog-title');
    let market = spec.market, category = 'crypto', source = 'keep', catalog, loading = false, generation = 0, limit = 50;
    const selected = new Map(), original = strategyTargets(spec);
    const frames = new Set([spec.timeframe]);
    const visit = value => { if (!value || typeof value !== 'object') return; if (value.timeframe) frames.add(value.timeframe); Object.values(value).forEach(visit); };
    visit(spec);
    dialog.innerHTML = `<header><div><h2 id="asset-dialog-title">เลือกสินทรัพย์</h2><p>รวมคู่เทรดจากทุกกระดานที่รองรับ</p></div><button type="button" data-close aria-label="ปิด">×</button></header>
      <nav class="asset-categories" aria-label="หมวดสินทรัพย์">${categories.map(([id, label]) => `<button type="button" data-category="${id}" aria-pressed="${id === category}">${label}<small data-total="${id}"></small></button>`).join('')}</nav>
      <div class="asset-toolbar"><div class="asset-products" role="group" aria-label="ประเภทสัญญา"><button type="button" data-market="Spot">Spot</button><button type="button" data-market="Perpetual Futures">Perpetual</button></div><label class="asset-source">แหล่งราคา<select data-source><option value="keep">อัตโนมัติ · คงแหล่งเดิม</option>${exchanges.map(e => `<option>${e}</option>`).join('')}</select></label></div>
      <div class="asset-search"><input type="search" aria-label="ค้นหาสินทรัพย์" placeholder="ค้นหา BTC, TSLA, XAU หรือชื่อคู่เทรด" autocomplete="off"><button type="button" data-refresh aria-label="ซิงก์รายชื่อใหม่">↻</button></div>
      <div class="asset-result-meta"><span data-status role="status">กำลังโหลดรายชื่อ…</span><button type="button" class="text-button" data-selected-only aria-pressed="false">ดูที่เลือก</button></div>
      <div class="asset-results" aria-label="รายการสินทรัพย์"></div><div class="asset-basket" aria-label="สินทรัพย์ที่เลือก"></div>
      <footer><span data-count role="status">เลือก 0 / ${maxPairs} คู่</span><button type="button" class="text-button" data-clear>ล้าง</button><button type="button" class="primary" data-apply disabled>ใช้สินทรัพย์ที่เลือก</button></footer>`;
    document.body.append(dialog);
    const query = selector => dialog.querySelector(selector), list = query('.asset-results'), search = query('input'), status = query('[data-status]'), apply = query('[data-apply]');
    let selectedOnly = false, seeded = false;
    const targetsFor = row => {
      const retained = original.filter(t => t.pair === row.symbol && row.sources.includes(t.exchange));
      return source === 'keep' && market === spec.market && retained.length ? retained : selectTargets([row], [row.symbol], source === 'keep' ? 'auto' : source, [...frames]);
    };
    const selectionState = () => {
      const targets = [...selected.values()].flatMap(value => value.targets);
      const valid = targets.every(t => catalog?.items.some(row => row.symbol === t.pair && row.sources.includes(t.exchange)));
      const pairs = new Set(targets.map(t => t.pair));
      apply.disabled = loading || !targets.length || !valid || pairs.size > maxPairs || targets.length > 50 || !current();
      query('[data-count]').textContent = `เลือก ${pairs.size} / ${maxPairs} คู่`;
      query('.asset-basket').innerHTML = [...selected].map(([id, value]) => `<button type="button" data-remove-asset="${escape(id)}" aria-label="นำ ${escape(value.row.symbol)} ออก">${escape(value.row.symbol)} <span aria-hidden="true">×</span></button>`).join('');
    };
    function paint() {
      if (market === 'Spot' && ['forex', 'indices'].includes(category)) category = 'crypto';
      const term = search.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      const matches = (catalog?.items ?? []).filter(row => (selectedOnly ? selected.has(row.id) : row.category === category) && (row.symbol + row.name).toUpperCase().replace(/[^A-Z0-9]/g, '').includes(term));
      const rank = row => Number(selected.has(row.id)) * 4 + Number(term && row.base === term) * 2 + Number(row.quote === 'USDT');
      matches.sort((a, b) => rank(b) - rank(a) || a.symbol.localeCompare(b.symbol));
      query('[data-selected-only]').setAttribute('aria-pressed', String(selectedOnly));
      dialog.querySelectorAll('[data-category]').forEach(button => {
        button.hidden = market === 'Spot' && ['forex', 'indices'].includes(button.dataset.category);
        button.setAttribute('aria-pressed', String(button.dataset.category === category && !selectedOnly));
      });
      dialog.querySelectorAll('[data-market]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.market === market)));
      dialog.querySelectorAll('[data-total]').forEach(total => { total.textContent = catalog ? String(catalog.items.filter(row => row.category === total.dataset.total).length) : ''; });
      const unavailable = catalog?.sources.filter(s => s.status !== 'READY').map(s => s.exchange) ?? [];
      status.textContent = loading ? 'กำลังซิงก์รายชื่อ…' : `${matches.length.toLocaleString('th-TH')} คู่${unavailable.length ? ` · เชื่อม ${unavailable.join(', ')} ไม่สำเร็จ` : ''}`;
      list.innerHTML = matches.slice(0, limit).map(row => {
        let targets, error;
        try { targets = targetsFor(row); } catch (e) { error = e.message; }
        return `<button type="button" class="asset-row" data-asset="${escape(row.id)}" aria-pressed="${selected.has(row.id)}" ${error && !selected.has(row.id) ? 'disabled' : ''} ${error ? `title="${escape(error)}"` : ''}><span class="asset-check" aria-hidden="true">${selected.has(row.id) ? '✓' : '+'}</span><span class="asset-row-name"><strong>${escape(row.symbol)}</strong><small>${escape(productLabel(row))}${row.name && row.name !== row.base ? ` · ${escape(row.name)}` : ''}</small></span><span class="asset-row-source">${escape(error ? source !== 'keep' && !row.sources.includes(source) ? `ไม่มีบน ${source}` : 'ไม่รองรับรอบตรวจนี้' : (selected.get(row.id)?.targets ?? targets).map(t => t.exchange).join(', '))}<small>${row.sources.length} แหล่งราคา</small></span></button>`;
      }).join('') + (matches.length > limit ? '<button type="button" class="asset-more" data-more>แสดงเพิ่มอีก 50 คู่</button>' : matches.length ? '' : '<p class="asset-empty">ไม่พบสินทรัพย์ในหมวดนี้ ลองเปลี่ยนคำค้นหรือประเภทสัญญา</p>');
      selectionState();
    }
    async function load(refresh = false) {
      const token = ++generation;
      loading = true; catalog = undefined; query('[data-refresh]').disabled = true; paint();
      list.innerHTML = '<p class="asset-empty" role="status">กำลังโหลดจากกระดาน…</p>';
      try {
        const data = await api(`/assets?market=${encodeURIComponent(market)}&refresh=${refresh}`);
        if (!dialog.open || token !== generation) return;
        catalog = data;
        if (!seeded) {
          for (const target of original) {
            const row = catalog.items.find(row => row.symbol === target.pair && row.sources.includes(target.exchange)) ?? { id: `missing:${target.exchange}:${target.pair}`, symbol: target.pair };
            const value = selected.get(row.id) ?? { row, targets: [] };
            value.targets.push(target); selected.set(row.id, value);
          }
          category = [...selected.values()].find(v => v.row.category)?.row.category ?? category;
          seeded = true;
        }
      } catch (error) {
        if (dialog.open && token === generation) { list.innerHTML = '<p class="asset-empty">โหลดไม่สำเร็จ กดซิงก์เพื่อลองใหม่</p>'; status.textContent = error.message; }
      } finally {
        if (dialog.open && token === generation) { loading = false; query('[data-refresh]').disabled = false; if (catalog) paint(); else selectionState(); }
      }
    }
    dialog.onclick = event => {
      const button = event.target.closest('button');
      if (!button || button.disabled) return;
      if (button.hasAttribute('data-close')) dialog.close();
      else if (button.dataset.category) { category = button.dataset.category; selectedOnly = false; limit = 50; paint(); }
      else if (button.dataset.market && market !== button.dataset.market) { market = button.dataset.market; selected.clear(); seeded = true; selectedOnly = false; limit = 50; load(); }
      else if (button.hasAttribute('data-refresh')) load(true);
      else if (button.hasAttribute('data-selected-only')) { selectedOnly = !selectedOnly; paint(); }
      else if (button.hasAttribute('data-more')) { limit += 50; paint(); }
      else if (button.hasAttribute('data-clear')) { selected.clear(); paint(); }
      else if (button.dataset.removeAsset) { selected.delete(button.dataset.removeAsset); paint(); }
      else if (button.dataset.asset) {
        const row = catalog.items.find(row => row.id === button.dataset.asset);
        if (selected.has(row.id)) selected.delete(row.id);
        else {
          if ([...selected.values()].some(value => value.row.symbol === row.symbol)) { status.textContent = 'ชื่อคู่ซ้ำต่างประเภท กรุณานำคู่เดิมออกก่อน'; return; }
          if (selected.size >= maxPairs) { status.textContent = `เลือกได้สูงสุด ${maxPairs} คู่ต่อเซ็ตอัพ`; return; }
          selected.set(row.id, { row, targets: targetsFor(row) });
        }
        paint();
      } else if (button.hasAttribute('data-apply')) {
        if (!current()) { status.textContent = 'เซ็ตอัพเปลี่ยนแล้ว กรุณาปิดและเลือกใหม่'; return; }
        const targets = [...selected.values()].flatMap(value => value.targets);
        resolve({ market, pairs: [...new Set(targets.map(t => t.pair))], exchange: [...new Set(targets.map(t => t.exchange))], targets });
        dialog.close();
      }
    };
    search.oninput = () => { limit = 50; paint(); };
    query('[data-source]').onchange = event => {
      source = event.target.value;
      const replacements = new Map();
      try { for (const [id, value] of selected) replacements.set(id, { row: value.row, targets: targetsFor(value.row) }); }
      catch (error) { status.textContent = error.message; source = 'keep'; event.target.value = source; event.target.dispatchEvent(new Event('snaap-select-sync')); return; }
      selected.clear(); replacements.forEach((v, id) => selected.set(id, v)); paint();
    };
    dialog.onclose = () => { generation++; dialog.remove(); resolve(null); };
    dialog.showModal(); search.focus(); load();
  });
}
