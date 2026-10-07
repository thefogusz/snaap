import { categories, exchanges, selectTargets, strategyTargets } from './asset-catalog.js';

// A small starting list; TradingView's symbol search inside the chart covers more markets.
const viewing = {
  stocks: [['NASDAQ:AAPL','Apple'],['NASDAQ:MSFT','Microsoft'],['NASDAQ:NVDA','NVIDIA'],['NASDAQ:TSLA','Tesla'],['NASDAQ:AMZN','Amazon'],['NYSE:KO','Coca-Cola']],
  etf: [['AMEX:SPY','SPDR S&P 500 ETF'],['NASDAQ:QQQ','Invesco QQQ ETF'],['AMEX:VOO','Vanguard S&P 500 ETF'],['AMEX:GLD','SPDR Gold Shares ETF']],
  forex: [['FX:EURUSD','EUR / USD'],['FX:GBPUSD','GBP / USD'],['FX:USDJPY','USD / JPY'],['FX:AUDUSD','AUD / USD']],
  commodities: [['OANDA:XAUUSD','ทอง · XAU/USD · ราคาอ้างอิงจากโบรกเกอร์'],['OANDA:XAGUSD','เงิน · XAG/USD · ราคาอ้างอิงจากโบรกเกอร์'],['TVC:USOIL','น้ำมัน WTI · CFD'],['TVC:UKOIL','น้ำมัน Brent · CFD']],
  indices: [['TVC:SPX','S&P 500 · ดัชนีอ้างอิง'],['TVC:NDX','Nasdaq 100 · ดัชนีอ้างอิง'],['TVC:DJI','Dow Jones · ดัชนีอ้างอิง'],['TVC:DAX','DAX · ดัชนีอ้างอิง']],
  futures: [['CME_MINI:ES1!','S&P 500 E-mini · สัญญาต่อเนื่อง'],['CME_MINI:NQ1!','Nasdaq E-mini · สัญญาต่อเนื่อง'],['COMEX:GC1!','Gold Futures · สัญญาต่อเนื่อง'],['NYMEX:CL1!','Crude Oil Futures · สัญญาต่อเนื่อง']],
};
export function pickAssets({ api, esc, initial, frames = [], maxPairs = 10, current = () => true, category = 'crypto' }) {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog');
    dialog.className = 'conversation-dialog instrument-dialog asset-dialog';
    dialog.setAttribute('aria-labelledby', 'asset-picker-title');
    let market = initial.market, selected = new Set(initial.pairs), items = [], data, loading = false, generation = 0;
    let scope = initial.pairs.length ? 'keep' : 'auto';
    let changedScope = false, applied = null, loadError = '';
    dialog.innerHTML = `<header><h2 id="asset-picker-title">เลือกสินทรัพย์</h2><button type="button" data-close aria-label="ปิด">×</button></header><div class="asset-fields"><label>หมวดสินทรัพย์<select data-category>${categories.map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></label><label data-crypto-type>ประเภทสัญญา<select data-market><option value="Spot">Spot</option><option value="Perpetual Futures">Perpetual Futures · USDT</option></select></label></div><label>ค้นหาชื่อย่อหรือคู่เทรด<input type="search" data-search placeholder="เช่น BTC, ETH, AAPL, EURUSD" autocomplete="off"></label><div data-crypto-controls><details class="asset-source-options"><summary>แหล่งข้อมูลและขอบเขตสัญญาณ</summary><label>ติดตามราคาจาก<select data-source><option value="keep">คงแหล่งเดิม · แนะนำสำหรับสินทรัพย์ที่เพิ่ม</option><option value="auto">แหล่งแนะนำอัตโนมัติ</option><option value="all">ทุกกระดานที่รองรับ</option>${exchanges.map(x=>`<option>${x}</option>`).join('')}</select></label><p class="field-note">เลือกเฉพาะแหล่งที่มีคู่เทรดและไทม์เฟรมที่ใช้ · แยกสัญญาณตามกระดาน · บันทึกแล้วจะไม่สลับแหล่งเอง</p></details><button type="button" class="text-button" data-refresh>ซิงก์ล่าสุด</button></div><p data-status role="status"></p><div class="instrument-list"></div><section data-viewing hidden><p class="field-note">ดูกราฟฟรีผ่าน TradingView · ข้อมูลอาจล่าช้าหรือไม่พร้อมตามสัญลักษณ์ · ยังตั้งสัญญาณ Snaap ในหมวดนี้ไม่ได้</p><div class="asset-widget"></div><a href="https://www.tradingview.com/" target="_blank" rel="noopener">Charts by TradingView</a><p class="field-note">ค้นหาสัญลักษณ์เพิ่มเติมได้ภายในกราฟ · ราคา CFD และสัญญาต่อเนื่องมีชนิดระบุไว้</p></section><footer class="pair-selection-footer" data-crypto-footer><span data-count></span><button type="button" class="text-button" data-clear>ล้างที่เลือก</button><button type="button" class="primary" data-apply disabled>ใช้สินทรัพย์ที่เลือก</button></footer>`;
    const find = s => dialog.querySelector(s);
    const opener = document.activeElement;
    document.body.append(dialog); dialog.showModal();
    find('[data-category]').value = category;
    find('[data-market]').value = market;
    find('[data-source]').value = scope;
    dialog.onclose = () => { generation++; dialog.remove(); if (opener?.isConnected) opener.focus(); resolve(applied); };
    find('[data-close]').onclick = () => dialog.close();
    const status = find('[data-status]');
    const viewingSource = document.createElement('p');
    viewingSource.className = 'field-note';
    find('.asset-widget').before(viewingSource);
    const picked = document.createElement('div');
    picked.className = 'asset-picked';
    picked.setAttribute('aria-label', 'สินทรัพย์ที่เลือก');
    status.before(picked);
    picked.onclick = e => { const button = e.target.closest('[data-remove-asset]'); if(button) { selected.delete(button.dataset.removeAsset); paint(); } };
    function targets() {
      // Preserve a saved/manual source until the user changes that choice explicitly.
      if (!changedScope && market === initial.market) {
        const previous = strategyTargets(initial).filter(t => selected.has(t.pair));
        if (previous.some(t => !items.find(m=>m.symbol===t.pair)?.sources.includes(t.exchange))) throw new Error('แหล่งเดิมไม่พร้อม · เลือกขอบเขตสัญญาณใหม่ก่อนใช้');
        return [...previous, ...selectTargets(items, [...selected].filter(pair=>!initial.pairs.includes(pair)), scope === 'keep' ? 'auto' : scope, frames)];
      }
      return selectTargets(items, [...selected], scope === 'keep' ? 'auto' : scope, frames);
    }
    function paint() {
      const crypto = category === 'crypto';
      for (const selector of ['[data-crypto-type]', '[data-crypto-controls]', '[data-crypto-footer]']) find(selector).hidden = !crypto;
      find('[data-viewing]').hidden = crypto;
      const q = find('[data-search]').value.toUpperCase().replace(/[^\p{L}\p{N}]/gu, '');
      const normalize = value => value.toUpperCase().replace(/[^\p{L}\p{N}]/gu, '');
      const matches = crypto ? items.filter(m => normalize(m.symbol).includes(q)) : viewing[category].filter(([symbol,name]) => normalize(symbol+' '+name).includes(q));
      if (crypto) matches.sort((a,b)=>Number(normalize(b.symbol)===q)-Number(normalize(a.symbol)===q)||Number(normalize(b.base)===q)-Number(normalize(a.base)===q));
      picked.hidden = !crypto;
      picked.innerHTML = [...selected].map(pair=>`<button type="button" class="text-button" data-remove-asset="${esc(pair)}" aria-label="นำ ${esc(pair)} ออก">${esc(pair)} ×</button>`).join('');
      let chosen = [], error = '';
      if (crypto && selected.size && !loading) try { chosen = targets(); } catch (e) { error = e.message; }
      if (!loading) status.textContent = crypto ? `${matches.length} คู่ · ${data?.sources.filter(s=>s.status==='READY').length ?? 0}/5 กระดานพร้อม${data ? ' · ซิงก์ '+new Date(data.at).toLocaleTimeString('th-TH') : ''}${data?.sources.some(s=>s.status!=='READY') ? ' · ไม่พร้อม: '+data.sources.filter(s=>s.status!=='READY').map(s=>s.exchange).join(', ') : ''}${error ? ' · '+error : ''}` : 'รายการเริ่มต้นสำหรับดูกราฟ · ไม่มีการเปิดแจ้งเตือน';
      if (!loading) find('.instrument-list').innerHTML = matches.slice(0,100).map(m => crypto
        ? `<button type="button" data-symbol="${esc(m.symbol)}" aria-pressed="${selected.has(m.symbol)}"><span><strong>${esc(m.base)}</strong> / ${esc(m.quote)}<small>${esc(m.market)} · ${esc(m.sources.join(' · '))}</small></span><span>${selected.has(m.symbol)?'✓':'เลือก'}</span></button>`
        : `<button type="button" data-view="${esc(m[0])}"><span><strong>${esc(m[0].split(':')[1])}</strong><small>${esc(m[1])}</small></span><span>ดูกราฟ</span></button>`).join('') + (matches.length > 100 ? '<p>แสดง 100 คู่แรก · พิมพ์เพิ่มเพื่อค้นหา</p>' : matches.length ? '' : '<p>ไม่พบสินทรัพย์ในรายการนี้</p>');
      find('[data-count]').textContent = `${selected.size}/${maxPairs} คู่${chosen.length ? ' · '+chosen.length+' แหล่งราคา' : ''}`;
      find('[data-apply]').disabled = loading || !selected.size || selected.size > maxPairs || !!error || !items.length;
      find('[data-refresh]').disabled = loading;
    }
    async function load(refresh = false) {
      const token = ++generation;
      loadError = '';
      find('.asset-widget').replaceChildren();
      viewingSource.textContent = '';
      if (category !== 'crypto') { loading = false; paint(); return; }
      loading = true; paint(); status.textContent = 'กำลังรวมสินทรัพย์จาก 5 กระดาน…';
      find('.instrument-list').textContent = 'กำลังโหลด…';
      try {
        const result = await api('/assets?'+new URLSearchParams({ market, refresh: String(refresh) }));
        if (!dialog.open || token !== generation) return;
        data = result; items = result.items;
      } catch (e) {
        if (!dialog.open || token !== generation) return;
        items = []; data = null; loadError = e.message;
      } finally {
        if (dialog.open && token === generation) { loading = false; paint(); if(loadError) status.textContent = loadError + ' · กดซิงก์ล่าสุดเพื่อลองใหม่'; }
      }
    }
    find('[data-category]').onchange = e => { category = e.target.value; find('[data-search]').value = ''; load(); };
    find('[data-market]').onchange = e => { market = e.target.value; selected.clear(); changedScope = true; load(); };
    find('[data-source]').onchange = e => { scope = e.target.value; changedScope = scope !== 'keep'; paint(); };
    find('[data-search]').oninput = paint;
    find('[data-refresh]').onclick = () => load(true);
    find('[data-clear]').onclick = () => { selected.clear(); paint(); };
    find('[data-apply]').onclick = () => {
      if (!current()) { status.textContent = 'ร่างเปลี่ยนแล้ว กรุณาปิดและเลือกใหม่'; return; }
      try {
        const chosen = targets();
        if (!chosen.length || selected.size > maxPairs || loading) return;
        applied = { market, pairs: [...selected], exchange: [...new Set(chosen.map(t=>t.exchange))], targets: chosen };
        dialog.close();
      } catch (e) { status.textContent = e.message; }
    };
    find('.instrument-list').onclick = e => {
      const button = e.target.closest('[data-symbol],[data-view]');
      if (!button) return;
      if (button.dataset.view) {
        viewingSource.textContent = `ข้อมูล: TradingView · เริ่มกราฟด้วย ${button.dataset.view} · ดูแหล่งราคาและความล่าช้าภายในกราฟ`;
        const frame = document.createElement('iframe');
        frame.title = `TradingView · ${button.dataset.view}`;
        frame.referrerPolicy = 'strict-origin-when-cross-origin';
        frame.src = 'https://www.tradingview-widget.com/embed-widget/advanced-chart/?locale=en#'+encodeURIComponent(JSON.stringify({ symbol: button.dataset.view, interval: 'D', timezone: 'Etc/UTC', theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light', style: '1', locale: 'en', allow_symbol_change: true, hide_side_toolbar: false, autosize: true }));
        find('.asset-widget').replaceChildren(frame);
        return;
      }
      const pair = button.dataset.symbol;
      if (selected.has(pair)) selected.delete(pair);
      else if (selected.size < maxPairs) selected.add(pair);
      else { status.textContent = `เลือกได้สูงสุด ${maxPairs} คู่ต่อเซ็ตอัพ`; return; }
      paint();
    };
    load();
  });
}
