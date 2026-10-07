// UI fixtures keep unread counts stable while exercising the real notification page.
const assert = require('node:assert/strict');
const {chromium} = require(process.env.SNAAP_PLAYWRIGHT_PATH || 'playwright');
const fs = require('node:fs');
(async () => {
  fs.mkdirSync('.local/mobile-audit', {recursive:true});
  const browser = await chromium.launch({channel:process.platform === 'win32' ? 'msedge' : undefined, headless:true});
  const page = await browser.newPage({viewport:{width:320,height:667}, hasTouch:true, reducedMotion:'reduce'});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let count = 105;
  await page.route('**/api/v1/signals/unread', route => route.fulfill({json:{count,latestId:'fixture-signal'}}));
  await page.route('**/api/v1/signals/read', route => route.fulfill({json:{ok:true}}));
  const origin = process.env.SNAAP_MOBILE_URL || 'http://127.0.0.1:4175';
  try {
    assert.ok((await page.request.post(origin+'/api/v1/auth/local', {headers:{'x-snaap-client':'web'},data:{}})).ok());
    await page.goto(origin+'/notifications');
    for (const width of [320,375,390,430,600,601,900,1440]) {
      await page.setViewportSize({width,height:844});
      await page.locator('[data-notification-tab="rules"]').click();
      const tab = page.locator('[data-notification-tab="inbox"]');
      const badge = tab.locator('.notification-count');
      await badge.waitFor();
      if (process.argv.includes('--before')) {
        await page.screenshot({path:'.local/mobile-audit/notification-badge-before-320.png'});
        console.log(await tab.evaluate(el => ({tab:el.getBoundingClientRect().toJSON(),badge:el.querySelector('.notification-count').getBoundingClientRect().toJSON()})));
        break;
      }
      for (const selected of [false,true]) {
        if (selected) await tab.click();
        const b = await badge.boundingBox(), t = await tab.boundingBox();
        const label = await tab.locator('span:not(.notification-count)').boundingBox();
        assert.ok(b.x>=t.x && b.y>=t.y && b.x+b.width<=t.x+t.width+1 && b.y+b.height<=t.y+t.height+1, 'Unread count fits inside its tab');
        if (width<=600) assert.ok(b.y+b.height<=label.y+1, 'Unread count stays above the tab label');
        assert.equal(await badge.innerText(), '99+');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth>innerWidth), false);
      }
      if (width===390) await page.screenshot({path:'.local/mobile-audit/notification-badge-fixed-390.png'});
      console.log('PASS notification badge',width);
    }
    if (!process.argv.includes('--before')) {
      for (count of [1,12,0]) {
        await page.evaluate(() => window.SnaapSignalUnread.refresh());
        const badge = page.locator('[data-notification-tab="inbox"] .notification-count');
        if (count) await page.waitForFunction(n => document.querySelector('[data-notification-tab="inbox"] .notification-count')?.textContent===String(n),count);
        else { await page.locator('[data-notification-tab="inbox"]').waitFor(); assert.equal(await badge.count(),0); }
      }
      assert.deepEqual(errors,[]);
    }
  } catch (error) {
    console.log('Notification UI on failure:', await page.locator('#view-notifications').textContent(), errors);
    await page.screenshot({path:'.local/mobile-audit/notification-badge-failed.png'});
    throw error;
  } finally {await browser.close();}
})().catch(error => {console.error(error);process.exitCode=1;});
