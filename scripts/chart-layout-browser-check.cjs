const assert = require('node:assert/strict');
const { chromium } = require(process.env.SNAAP_PLAYWRIGHT_PATH || 'playwright');
const fs = require('node:fs');
(async () => {
  fs.mkdirSync('.local/audit', { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1596, height: 837 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(process.env.SNAAP_LAYOUT_URL || 'http://127.0.0.1:4289');
    await page.getByRole('button', { name: 'ใช้บัญชีทดสอบ', exact: true }).click();
    await page.getByRole('button', { name: 'แชท + เซ็ตอัพ', exact: true }).click();
    await page.locator('[data-chart-status]').filter({ hasText: /\d+ แท่งปิด/ }).waitFor();
    // Match the supplied screen: several oscillators as well as price overlays.
    for (const name of ['MACD','MACD_SIGNAL','STOCH_RSI_K','STOCH_RSI_D']) {
      await page.locator('[data-add-chart-indicator]').click();
      await page.locator('.studio-dialog input[type="search"]').fill(name);
      await page.locator(`[data-pick-indicator="${name}"]`).click();
      await page.locator('.chart-legend').filter({hasText:name === 'STOCH_RSI_K' ? 'Stochastic RSI K' : name === 'STOCH_RSI_D' ? 'Stochastic RSI D' : name}).waitFor();
    }
    await page.getByRole('button',{name:'โหมดมืด',exact:true}).click();
    const sizes = [[1596,837],[1440,900],[1024,768],[390,844],[768,1024]];
    for (const [width,height] of sizes) {
      await page.setViewportSize({width,height});
      await page.waitForTimeout(300);
      const layout = await page.locator('.setup-studio').evaluate(el => {
        const canvas = el.querySelector('.studio-canvas');
        const rect = canvas.getBoundingClientRect();
        const box = el.getBoundingClientRect();
        return { scroll: el.scrollHeight - el.clientHeight, height:rect.height, bottom:rect.bottom, panelBottom:box.bottom, viewport:innerHeight };
      });
      console.log(width,height,layout);
      await page.screenshot({path:`.local/audit/chart-layout-${width}.png`});
      assert.ok(layout.scroll <= 1, 'Chart panel must not scroll vertically');
      assert.ok(layout.height >= 100 && layout.bottom <= layout.panelBottom && layout.panelBottom <= layout.viewport + 1, 'Whole chart fits the viewport');
    }
    await page.setViewportSize({width:1596,height:837});
    const before = await page.locator('.studio-canvas').boundingBox();
    await page.getByRole('button',{name:'สถานะสัญญาณ',exact:true}).click();
    await page.locator('.studio-signals-dialog').waitFor({state:'visible'});
    assert.ok(await page.locator('.studio-signals-dialog [data-setup-insights]').isVisible());
    await page.screenshot({path:'.local/audit/chart-layout-signals.png'});
    await page.keyboard.press('Escape');
    assert.deepEqual(await page.locator('.studio-canvas').boundingBox(),before);
    await page.locator('.studio-replay > summary').click();
    await page.locator('[data-step]').click();
    await page.locator('[data-latest]').click();
    await page.screenshot({path:'.local/audit/chart-layout-replay.png'});
    assert.ok(await page.locator('.setup-studio').evaluate(el => el.scrollHeight <= el.clientHeight + 1));
    await page.locator('[data-chart-frame="30m"]').click();
    await page.locator('[data-chart-title]').filter({hasText:'· 30m ·'}).waitFor();
    await page.getByRole('button',{name:'สถานะสัญญาณ',exact:true}).click();
    await page.locator('.studio-signals-dialog .studio-event-list').waitFor({state:'visible'});
    await page.getByRole('button',{name:'ปิดสถานะสัญญาณ',exact:true}).click();
    assert.deepEqual(errors,[]);
    console.log('PASS viewport fit, signal dialog, replay and clean browser runtime');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
