// Run against scripts/harness-smoke.ts --serve; SNAAP_PLAYWRIGHT_PATH can use an existing Playwright install.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.SNAAP_PLAYWRIGHT_PATH || 'playwright');
const fs = require('node:fs');
(async () => {
  fs.mkdirSync('.local/mobile-audit', { recursive: true });
  const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400 && response.status() !== 401) console.log('HTTP', response.status(), response.url()); });
  const fits = async (selector, minimum = 44) => {
    const box = await page.locator(selector).boundingBox();
    if (!box || box.height < minimum || box.y < 0 || box.y + box.height > page.viewportSize().height + 1) await page.screenshot({ path: '.local/mobile-audit/failed-layout.png' });
    assert.ok(box && box.height >= minimum && box.y >= 0 && box.y + box.height <= page.viewportSize().height + 1, `${selector} must fit and remain usable: ${JSON.stringify(box)}`);
    return box;
  };
  try {
    const origin = process.env.SNAAP_MOBILE_URL || 'http://127.0.0.1:4175';
    const login = await page.request.post(origin + '/api/v1/auth/local', { headers: { 'x-snaap-client': 'web' }, data: {} });
    assert.ok(login.ok(), 'Local harness login must succeed');
    await page.goto(origin + '/home');
    const menu = page.locator('[data-action="menu"]');
    await menu.click();
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#sidebar')).transform === 'matrix(1, 0, 0, 1, 0, 0)');
    await page.screenshot({ path: '.local/mobile-audit/fixed-menu.png' });
    await page.mouse.click(380, 400);
    assert.equal(await page.locator('#sidebar').evaluate(el => el.classList.contains('is-open')), false, 'Outside tap closes the drawer');
    await menu.click();
    assert.equal(await menu.getAttribute('aria-expanded'), 'true');
    assert.ok(await page.locator('#sidebar').evaluate(el => el.contains(document.activeElement)), 'Opening moves focus into the drawer');
    await page.locator('#sidebar .profile').focus();
    await page.keyboard.press('Tab');
    assert.ok(await page.locator('#sidebar').evaluate(el => el.contains(document.activeElement)), 'Tab stays inside the drawer');
    await page.keyboard.press('Escape');
    assert.equal(await menu.getAttribute('aria-expanded'), 'false');
    assert.ok(await menu.evaluate(el => el === document.activeElement), 'Closing restores focus');
    await menu.click();
    await page.locator('.sidebar-close').click();
    assert.equal(await menu.getAttribute('aria-expanded'), 'false');
    await menu.click();
    await page.locator('#sidebar [data-view="notifications"]').click();
    assert.equal(await menu.getAttribute('aria-expanded'), 'false');
    await menu.click();
    await page.locator('#sidebar [data-view="home"]').click();
    await page.getByRole('button', { name: 'แชท + เซ็ตอัพ', exact: true }).click();
    await page.locator('.studio-canvas canvas').first().waitFor();
    for (const [width, height] of [[320,568], [375,667], [390,844], [430,932], [844,390], [900,768], [1440,900]]) {
      await page.setViewportSize({ width, height });
      if (width < 900) {
        await fits('[data-action="menu"]');
        await menu.click();
        await fits('.sidebar-close');
        await page.keyboard.press('Escape');
        if (height <= 740) await page.locator('[data-studio-tab="chart"]').click();
      }
      const chart = await fits('.studio-canvas', 100);
      const frames = await page.locator('[data-chart-frame]').filter({ hasText: '15M' }).boundingBox();
      if (width < 900) assert.ok(frames.width >= 44 && frames.height >= 44, 'Timeframes have comfortable touch targets');
      await page.screenshot({ path: `.local/mobile-audit/fixed-chart-${width}.png` });
      if (width < 1280) await page.locator('[data-studio-tab="agent"]').click();
      await fits('.chat-send-button', width < 900 ? 44 : 40);
      await page.locator('#followup-input').fill('ข้อความยาว '.repeat(100));
      await fits('.chat-send-button', width < 900 ? 44 : 40);
      await page.locator('#followup-input').fill('');
      await page.screenshot({ path: `.local/mobile-audit/fixed-agent-${width}.png` });
      if (width < 1280) await page.locator('[data-studio-tab="conditions"]').click();
      await fits('.design-panel', 160);
      if (width < 900) await fits('.design-panel .setting-guide-trigger[data-guide="name"]', 44);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'No horizontal page overflow');
      console.log(`PASS ${width}x${height}: chart ${Math.round(chart.height)}px, visible send button, usable inspector`);
    }
    await page.setViewportSize({ width: 375, height: 667 });
    await page.locator('[data-studio-tab="chart"]').click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.workbench[data-inspector="conditions"]').waitFor();
    await fits('.design-panel', 160);
    await menu.click();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('[data-action="menu"][aria-expanded="false"]').waitFor({ state: 'attached' });
    assert.equal(await page.locator('.main-shell').evaluate(el => el.inert), false);
    assert.deepEqual(errors, []);
    console.log('PASS drawer dismissal, keyboard focus, touch targets and responsive layouts');
  } catch (error) {
    await page.screenshot({ path: '.local/mobile-audit/failed-layout.png' });
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
