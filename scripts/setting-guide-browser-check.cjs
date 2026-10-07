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
  const server = http.createServer((req, res) => {
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
    assert.deepEqual(errors, []);
    console.log('PASS help hitbox, picker, input labels, keyboard access and viewport bounds at four sizes');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
