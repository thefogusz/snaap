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
    await page.locator('[data-studio-tab="chart"]').click();
    await page.locator('.studio-canvas canvas').first().waitFor();
    for (const [width, height] of [[320,568], [375,667], [390,844], [430,932], [844,390], [900,768], [1440,900]]) {
      await page.setViewportSize({ width, height });
      if (width < 900) {
        await fits('[data-action="menu"]');
        await menu.click();
        await fits('.sidebar-close');
        await page.keyboard.press('Escape');
        await page.locator('[data-studio-tab="chart"]').click();
      }
      const chart = await fits('.studio-canvas', 100);
      if (width < 900) {
        const frames = await fits('.studio-mobile-frame');
        assert.ok(frames.width >= 44, 'Timeframe select is a comfortable touch target');
        await page.locator('.studio-mobile-frame').selectOption('1h');
        await page.locator('[data-chart-frame="1h"][aria-pressed="true"]').waitFor({ state: 'attached' });
        await page.locator('.studio-mobile-frame').selectOption('15m');
      }
      await page.screenshot({ path: `.local/mobile-audit/fixed-chart-${width}.png` });
      if (width < 1280) await page.locator('[data-studio-tab="agent"]').click();
      await fits('.chat-send-button', width < 900 ? 44 : 40);
      await page.locator('#followup-input').fill('ข้อความยาว '.repeat(100));
      await fits('.chat-send-button', width < 900 ? 44 : 40);
      await page.locator('#followup-input').fill('');
      if (width < 900) {
        await page.locator('.chat-empty').evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished)));
        await page.waitForFunction(() => {
          const headline = document.querySelector('.chat-empty').getBoundingClientRect();
          const composer = document.querySelector('.chat-composer').getBoundingClientRect();
          const gap = composer.top - headline.bottom;
          return gap >= 20 && gap <= 25;
        });
        const greeting = await page.locator('.chat-empty').boundingBox();
        const composer = await page.locator('.chat-composer').boundingBox();
        const gap = composer && greeting && composer.y - greeting.y - greeting.height;
        assert.ok(gap >= 20 && gap <= 25, 'Empty chat keeps its headline and composer together');
      }
      await page.screenshot({ path: `.local/mobile-audit/fixed-agent-${width}.png` });
      if (width < 1280) await page.locator('[data-studio-tab="conditions"]').click();
      const designer = await fits('.design-panel', 160);
      if (width < 900) {
        assert.ok(designer.y <= 112 && designer.height >= height - 120, 'Setup gets the viewport below two compact navigation rows');
        assert.equal(await page.locator('.setup-studio').isVisible(), false, 'Chart controls do not consume setup space');
        await fits('.design-panel .setting-guide-trigger[data-guide="name"]', 44);
        await page.screenshot({ path: `.local/mobile-audit/redesign-setup-${width}.png` });
        await page.locator('.studio-mobile-menu > summary').click();
        await page.locator('.studio-mobile-menu [data-studio-tab="evidence"]').click();
        assert.equal(await page.locator('.studio-reason-pane').isVisible(), true);
        await page.locator('[data-studio-tab="conditions"]').click();
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'No horizontal page overflow');
      console.log(`PASS ${width}x${height}: chart ${Math.round(chart.height)}px, visible send button, usable inspector`);
    }
    await page.setViewportSize({ width: 375, height: 667 });
    await page.locator('[data-studio-tab="chart"]').click();
    await page.setViewportSize({ width: 390, height: 844 });
    await fits('.studio-canvas', 100);
    await page.locator('[data-studio-tab="agent"]').click();
    await page.locator('#followup-input').fill('ไอเดียที่ยังไม่ได้ส่ง');
    await page.locator('[data-studio-tab="conditions"]').click();
    await page.locator('[data-studio-tab="chart"]').click();
    await page.locator('[data-studio-tab="agent"]').click();
    assert.equal(await page.locator('#followup-input').inputValue(), 'ไอเดียที่ยังไม่ได้ส่ง', 'Switching panes preserves the unsent idea');
    await page.locator('#followup-input').fill('');
    await page.locator('.studio-mobile-menu > summary').click();
    await page.locator('.studio-mobile-menu .conversation-picker').click();
    await page.locator('.conversation-dialog[open]').waitFor();
    await page.keyboard.press('Escape');
    await page.locator('.studio-mobile-menu > summary').click();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.studio-mobile-menu').evaluate(el => el.open), false);
    await page.locator('.studio-mobile-menu > summary').click();
    await page.locator('.studio-mobile-menu [data-action="new"]').click();
    await fits('.chat-send-button');
    await page.locator('#followup-input').fill('BTC ราคาเหนือ EMA 200');
    await page.locator('.chat-send-button').click();
    await page.locator('#messages .message.user').waitFor();
    assert.equal(await page.locator('.chat-empty').isVisible(), false, 'The first sent message hides the headline');
    const activeComposer = await fits('.chat-composer', 44);
    assert.ok(activeComposer.y + activeComposer.height >= 820, 'Active chat anchors the composer at the bottom');
    await page.locator('.chat-send-button').waitFor({ state: 'visible' });
    await page.waitForFunction(() => !document.querySelector('.chat-send-button').disabled);
    await page.screenshot({ path: '.local/mobile-audit/chat-started-390.png' });
    await page.locator('.studio-mobile-menu > summary').click();
    await page.locator('.studio-mobile-menu [data-action="new"]').click();
    assert.equal(await page.locator('.chat-empty').isVisible(), true, 'A new conversation restores the headline');
    await page.locator('.chat-empty').evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished)));
    await page.locator('#theme-toggle').click();
    await page.screenshot({ path: '.local/mobile-audit/chat-empty-390.png' });
    await page.locator('[data-studio-tab="conditions"]').click();
    const freshDesigner = await fits('.design-panel', 160);
    assert.ok(freshDesigner.y <= 112, 'A new chat retains compact navigation');
    await page.locator('.studio-mobile-menu > summary').click();
    await page.mouse.click(10, 300);
    assert.equal(await page.locator('.studio-mobile-menu').evaluate(el => el.open), false);
    await page.locator('[data-studio-tab="conditions"]').click();
    await page.locator('.studio-condition-overview [data-add="entry"]').click();
    await page.locator('[data-studio-view]').first().click();
    await page.locator('.workbench[data-inspector="chart"]').waitFor();
    await fits('.studio-canvas', 100);
    await page.locator('[data-add-chart-indicator]').click();
    await page.locator('.studio-dialog [data-pick-indicator="EMA"]').click();
    await page.locator('.studio-operand-inspector').waitFor();
    assert.equal(await page.locator('.design-panel').isVisible(), true, 'Indicator editing opens its visible pane');
    await page.locator('[data-close-inspector]').click();
    await menu.click();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('[data-action="menu"][aria-expanded="false"]').waitFor({ state: 'attached' });
    assert.equal(await page.locator('.main-shell').evaluate(el => el.inert), false);
    await page.locator('[data-tab="chat"]').click();
    await page.setViewportSize({ width: 375, height: 667 });
    await page.locator('.workbench[data-tab="split"][data-inspector="agent"]').waitFor();
    await fits('.chat-send-button');
    await page.locator('[data-studio-tab="conditions"]').click();
    await page.locator('#theme-toggle').click();
    await page.locator('.studio-inspector-tabs').evaluate(el => Promise.all(el.getAnimations({ subtree: true }).map(animation => animation.finished)));
    await page.screenshot({ path: '.local/mobile-audit/redesign-dark.png' });
    assert.deepEqual(errors, []);
    console.log('PASS drawer dismissal, keyboard focus, touch targets and responsive layouts');
  } catch (error) {
    await page.screenshot({ path: '.local/mobile-audit/failed-layout.png' });
    console.log('Conversation on failure:', await page.locator('#messages').textContent());
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
