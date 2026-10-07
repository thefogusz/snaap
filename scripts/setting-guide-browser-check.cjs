// Isolated editor fixture using this checkout's production styles and scripts.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.SNAAP_PLAYWRIGHT_PATH || 'playwright');

(async () => {
  const root = path.resolve(__dirname, '../dist');
  const styles = [...fs.readFileSync(path.join(root, 'index.html'), 'utf8').matchAll(/<link rel="stylesheet" href="(\/[^\"]+)"/g)].map(match => `<link rel="stylesheet" href="${match[1]}">`).join('');
  const html = `<!doctype html><html data-theme="dark"><head><meta charset="utf-8">${styles}</head><body><div class="design-panel"><div class="design-body"><div class="studio-setup-settings"><label>ตลาด<select data-path="market"><option>Spot</option><option>Perpetual Futures</option></select></label><label>ชื่อเซตอัพ<input data-path="name"></label></div></div></div><script src="/guide-scenes.js"></script><script src="/setting-guides.js"></script><script src="/selects.js"></script></body></html>`;
  const fields = [
    ['name', 'name', 'input'], ['market', 'market', 'Spot'], ['timeframe', 'timeframe', '15m'],
    ['operandFrame', 'entry.left.timeframe', '1h'], ['kind', '', 'PRICE'],
    ['indicator', 'entry.left.name', 'RSI'], ['field', 'entry.left.field', 'close'],
    ['source', 'entry.left.source', 'hlc3'], ['op', 'entry.op', 'CROSS_ABOVE'],
    ...['period', 'value', 'deviation', 'slow', 'signal', 'bars', 'withinBars', 'cooldownBars'].map(key => [key, `entry.${key}`, 'input']),
  ].map(([key, fieldPath, value]) => [key, `<label>ค่าทดสอบ${value === 'input' ? `<input data-path="${fieldPath}" value="14">` : `<select ${key === 'kind' ? 'data-opkind="entry.left"' : `data-path="${fieldPath}"`}><option>${value}</option></select>`}</label>`]);
  const cases = [...fields,
    ['exchange', '<fieldset class="exchange-fieldset"><legend>เลือกกระดาน</legend></fieldset>'],
    ['pair', '<div class="pair-control"><span>คู่เทรด</span><button data-pair-picker>BTC/USDT</button></div>'],
    ['destinations', '<fieldset class="destination-choices"><legend>แจ้งเตือนไปที่</legend></fieldset>'],
    ...[['entry', 'เงื่อนไขเริ่มต้น'], ['withinBars', 'รอยืนยัน'], ['exit', 'สัญญาณออก']].map(([key, text]) => [key, `<section class="setup-section"><h3>${text}</h3></section>`]),
    ...[['exit', 'สัญญาณออก'], ['cancel', 'ยกเลิก']].map(([key, text]) => [key, `<div class="optional-heading"><h4>${text}</h4></div>`]),
    ['group', '<div class="condition-group">กลุ่มเงื่อนไข<select data-path="entry.op"><option>AND</option></select></div>'],
    ...[['import', 'import-indicator'], ['group', 'group'], ['bars', 'hold']].map(([key, attribute]) => [key, `<button data-${attribute}>จัดการเงื่อนไข</button>`]),
    ['mirror', '<fieldset class="setup-direction"><div class="direction-mirror-row"><label class="direction-mirror"><input type="checkbox"><span>สลับเงื่อนไข Short</span></label></div></fieldset>'],
    ['direction', '<fieldset class="setup-direction"><legend>ฝั่งสัญญาณ</legend></fieldset>'],
  ];
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/?case=')) {
      const [, markup] = cases[Number(new URL(req.url, 'http://localhost').searchParams.get('case'))];
      return res.end(html.replace(/<div class="studio-setup-settings">.*?<\/div>/, `<div class="studio-setup-settings">${markup}</div>`));
    }
    if (req.url === '/') return res.end(html);
    const file = path.join(root, path.basename(req.url));
    if (!fs.existsSync(file)) { res.statusCode = 404; return res.end(); }
    res.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : 'text/javascript');
    res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const [width, height] of [[1440, 900], [648, 375], [390, 844], [320, 568]]) {
      await page.setViewportSize({ width, height });
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      const help = page.locator('[data-guide="market"]');
      const label = page.locator('label').first();
      const caption = page.locator('.guide-label').first();
      await caption.click({ position: { x: 2, y: 10 } });
      await page.waitForTimeout(300);
      assert.equal(await page.locator('.setting-guide').count(), 0, 'Market caption must not activate help');
      const box = await label.boundingBox();
      await page.mouse.click(box.x + box.width - 5, box.y + 10);
      await page.waitForTimeout(300);
      assert.equal(await page.locator('.setting-guide').count(), 0, 'Blank label space must not activate help');
      await help.click();
      await page.waitForTimeout(250);
      const tip = await page.locator('.setting-guide').boundingBox();
      assert.ok(tip.x >= 0 && tip.y >= 0 && tip.x + tip.width <= width && tip.y + tip.height <= height, 'Help must fit the viewport');
      if (width === 648) {
        fs.mkdirSync('.local/audit', { recursive: true });
        await page.screenshot({ path: '.local/audit/market-guide.png' });
      }
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('.setting-guide').count(), 0);
      await page.getByRole('combobox', { name: 'ตลาด', exact: true }).click();
      assert.equal(await page.locator('.snaap-select-menu').count(), 1);
      assert.equal(await page.locator('.setting-guide').count(), 0);
      await page.keyboard.press('Escape');
      const nameLabel = page.locator('label').nth(1);
      await nameLabel.locator('.guide-label').click({ position: { x: 2, y: 10 } });
      assert.ok(await nameLabel.locator('input').evaluate(el => el === document.activeElement), 'Input caption must still focus its input');
      await help.focus();
      assert.equal(await page.locator('.setting-guide').count(), 1, 'Keyboard focus opens help');
      await page.keyboard.press('Escape');
    }
    for (const [width, height] of [[1440, 900], [320, 568]]) {
      await page.setViewportSize({ width, height });
      for (const [index, [key]] of cases.entries()) {
        await page.goto(`http://127.0.0.1:${server.address().port}/?case=${index}`);
        const help = page.locator(`[data-guide="${key}"]`).last();
        await help.waitFor();
        const parent = help.locator('..');
        // Click caption/neighbor action, then blank space beside the help button.
        await parent.click({ position: { x: 2, y: 10 } });
        await page.waitForTimeout(230);
        assert.equal(await page.locator('.setting-guide').count(), 0, `${key}: caption must not activate help`);
        const box = await help.boundingBox();
        await page.mouse.click(box.x + box.width + 5, box.y + box.height / 2);
        await page.waitForTimeout(230);
        assert.equal(await page.locator('.setting-guide').count(), 0, `${key}: outside click must not activate help`);
        await help.click();
        await page.waitForTimeout(200);
        const tip = await page.locator('.setting-guide').boundingBox();
        assert.ok(tip.x >= 0 && tip.y >= 0 && tip.x + tip.width <= width && tip.y + tip.height <= height, `${key}: tooltip must fit`);
        await page.keyboard.press('Escape');
        await page.keyboard.press('Tab');
        await help.focus();
        assert.equal(await page.locator('.setting-guide').count(), 1, `${key}: keyboard focus opens help`);
        await page.keyboard.press('Escape');
      }
      console.log(`PASS all ${cases.length} help placements at ${width}px`);
    }
    assert.deepEqual(errors, []);
    console.log('PASS help hitbox, picker, input labels, keyboard access and viewport bounds at four sizes');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
