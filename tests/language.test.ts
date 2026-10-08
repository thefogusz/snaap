import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultLanguage, conversationLanguage, languageInstruction, translateText } from '../src/language.js';
import { countryLookup } from '../src/language.js';
import { readFile, readdir } from 'node:fs/promises';
import vm from 'node:vm';
import type pg from 'pg';
import { buildApp } from '../src/api.js';

test('country determines first-visit language; saved preference takes priority', () => {
  assert.equal(defaultLanguage('en', 'TH', 'th'), 'en');
  assert.equal(defaultLanguage(undefined, 'TH', 'en'), 'th');
  assert.equal(defaultLanguage(undefined, 'US', 'th'), 'en');
  assert.equal(defaultLanguage(undefined, null, 'th,en;q=0.9'), 'th');
  assert.equal(defaultLanguage('invalid', null, 'en,th;q=0.5'), 'en');
});

test('conversation follows latest language, using UI language for symbols and short ambiguous replies', () => {
  assert.equal(conversationLanguage('ช่วยอธิบาย RSI ให้หน่อย'), 'th');
  assert.equal(conversationLanguage('Explain RSI on BTC'), 'en');
  assert.equal(conversationLanguage('BTC/USDT 1h'), null);
  assert.equal(conversationLanguage('okay'), 'en');
  assert.match(languageInstruction('en'), /English/);
  assert.match(languageInstruction('th'), /Thai/);
});

test('static translation preserves markup and is deterministic', () => {
  assert.equal(translateText('<button title="บันทึก">บันทึก</button>', {'บันทึก':'Save'}), '<button title="Save">Save</button>');
  assert.equal(translateText('EMAตัดขึ้น RSI', {'ตัดขึ้น':'crosses above'}), 'EMA crosses above RSI');
});

test('the English catalog covers every public HTML page and contains safe static copy', async () => {
  const dictionary = JSON.parse(await readFile(new URL('../dist/translations/en.json', import.meta.url), 'utf8'));
  for (const [key, value] of Object.entries(dictionary)) assert.doesNotMatch(String(value), /[<>"'`\u0e00-\u0e7f]/, key);
  for (const file of (await readdir(new URL('../dist/', import.meta.url))).filter(file => file.endsWith('.html'))) {
    const source = await readFile(new URL('../dist/' + file, import.meta.url), 'utf8');
    assert.doesNotMatch(translateText(source, dictionary), /[\u0e00-\u0e7f]/, file);
    assert.match(source, /src="\/language.js"/, file);
  }
});

test('country lookup is bounded, coalesces public IP reads and never sends private IPs', async () => {
  let reads = 0;
  const lookup = countryLookup((async (_url: unknown, options: RequestInit) => {
    reads++;
    assert.ok(options.signal);
    return Response.json({ success: true, country_code: 'TH' });
  }) as typeof fetch);
  assert.deepEqual(await Promise.all([lookup('8.8.8.8'), lookup('8.8.8.8')]), ['TH', 'TH']);
  for (const ip of ['127.0.0.1', '10.0.0.1', '::1', 'not-an-ip']) assert.equal(await lookup(ip), null);
  assert.equal(reads, 1);
  const invalid = countryLookup((async () => Response.json({ success: false, country_code: 'TH' })) as typeof fetch);
  assert.equal(await invalid('8.8.8.8'), null);
  const offline = countryLookup((async () => { throw Error('offline'); }) as typeof fetch);
  assert.equal(await offline('8.8.8.8'), null);
});

test('public pages, bootstrap and API errors use the chosen language without shared caching', async () => {
  const query = async () => ({ rowCount: 0, rows: [] });
  const db = { query } as unknown as pg.Pool;
  let reads = 0;
  const app = (await buildApp(db, { countryLookup: async () => { reads++; return 'US'; } })).app;
  const host = '127.0.0.1:4173';
  try {
    const first = await app.inject({ url: '/', headers: { host, 'accept-language': 'th' } });
    assert.match(first.body, /<html lang="en">/);
    assert.match(first.body, /Privacy policy/);
    assert.doesNotMatch(first.body, /[\u0e00-\u0e7f]/);
    assert.match(String(first.headers['set-cookie']), /snaap_language=en/);
    assert.equal(first.headers['cache-control'], 'no-store');
    const thai = await app.inject({ url: '/home', headers: { host, cookie: 'snaap_language=th' } });
    assert.match(thai.body, /<html lang="th">/);
    assert.equal(reads, 1, 'saved preferences must not make another country request');
    const english = await app.inject({ url: '/home', headers: { host, cookie: 'snaap_language=en' } });
    assert.doesNotMatch(english.body, /[\u0e00-\u0e7f]/);
    const bootstrap = await app.inject({ url: '/language.js', headers: { host, cookie: 'snaap_language=en' } });
    assert.match(bootstrap.body, /"language":"en"/);
    assert.match(bootstrap.headers['content-type'] as string, /javascript/);
    const denied = await app.inject({ url: '/api/v1/me', headers: { host, cookie: 'snaap_language=en' } });
    assert.equal(denied.statusCode, 401);
    assert.doesNotMatch(denied.json().error.message, /[\u0e00-\u0e7f]/);
  } finally { await app.close(); }
});

test('login pages inherit the selected language without adding a language switch', async () => {
  const runtime = await readFile(new URL('../dist/language.js', import.meta.url), 'utf8');
  for (const file of ['login.html', 'admin-login.html']) {
    assert.match(await readFile(new URL('../dist/' + file, import.meta.url), 'utf8'), /class="login-card"/);
    for (const language of ['th', 'en']) {
      const context = vm.createContext({
        window: { SnaapLanguage: { language, dictionary: { 'บันทึก': 'Save' } } },
        document: {
          documentElement: {},
          querySelector: (selector: string) => selector === '.login-card' ? {} : null,
          addEventListener: (_event: string, callback: () => void) => callback(),
          createElement: () => assert.fail('login must not create a language switch'),
        },
      });
      vm.runInContext(runtime, context);
      assert.equal(context.document.documentElement.lang, language);
      assert.equal(context.window.SnaapI18n.text('บันทึก'), language === 'en' ? 'Save' : 'บันทึก');
    }
  }
});

test('app language control shows the current language with an accessible switch label', async () => {
  const runtime = await readFile(new URL('../dist/language.js', import.meta.url), 'utf8');
  for (const language of ['th', 'en']) {
    const attributes: Record<string, string> = {};
    const toggle = { textContent: '', title: '', setAttribute: (key: string, value: string) => { attributes[key] = value; }, getAttribute: (key: string) => attributes[key], addEventListener() {} };
    let appended: unknown;
    const context = vm.createContext({
      window: { SnaapLanguage: { language, dictionary: {} } },
      document: {
        documentElement: {},
        querySelector: (selector: string) => selector === '.topbar-actions' ? { append: (element: unknown) => { appended = element; } } : null,
        createElement: () => toggle,
        addEventListener: (_event: string, callback: () => void) => callback(),
      },
    });
    vm.runInContext(runtime, context);
    assert.equal(appended, toggle);
    assert.equal(toggle.textContent, language === 'th' ? 'ไทย' : 'EN');
    assert.equal(toggle.title, language === 'th' ? 'เปลี่ยนภาษาเป็นอังกฤษ' : 'Switch language to Thai');
    assert.equal(attributes['aria-label'], toggle.title);
  }
});

test('English rendering keeps user names and interpolated values in their original language', async () => {
  const dictionary = JSON.parse(await readFile(new URL('../dist/translations/en.json', import.meta.url), 'utf8'));
  const runtime = await readFile(new URL('../dist/language.js', import.meta.url), 'utf8');
  const context = vm.createContext({ window: { SnaapLanguage: { language: 'en', dictionary } }, document: { documentElement: {}, addEventListener() {} } });
  vm.runInContext(runtime, context);
  const setupSource = await readFile(new URL('../dist/setup-card.js', import.meta.url), 'utf8');
  const setupCardMarkup = vm.runInNewContext(setupSource.replaceAll('export ', '') + ';setupCardMarkup', { SnaapI18n: context.window.SnaapI18n });
    const html = setupCardMarkup({ spec: { name: 'บันทึก', market: 'Spot', pairs: ['BTC/USDT'], exchange: ['Binance'], timeframe: '1h' }, status: 'Active' }, { esc: (value: unknown) => String(value), fullSummary: () => '' });
    assert.match(html, /<h3>บันทึก<\/h3>/);
    assert.match(html, /Trading setup/);
    const summary = setupCardMarkup({ spec: { name: 'บันทึก', market: 'Spot', pairs: ['BTC/USDT'], exchange: ['Binance'], timeframe: '1h' }, status: 'Active' }, { esc: (value: unknown) => String(value), fullSummary: () => 'Long\nExit: CLOSE >= EMA\nCancel: CLOSE < EMA' });
    assert.match(summary, /data-tone="exit"/);
    assert.match(summary, /data-tone="cancel"/);
    assert.doesNotMatch(summary.replace('<h3>บันทึก</h3>', ''), /[\u0e00-\u0e7f]/);
});

test('draft status does not infer saving or failure from translated words', async () => {
  const source = await readFile(new URL('../dist/workbench.js', import.meta.url), 'utf8');
  const label = { textContent: '', hidden: true, title: '', dataset: {} as Record<string, string> };
  const context = vm.createContext({ panel: { querySelector: (selector: string) => selector === '[data-draft-status]' ? label : null }, SnaapI18n: { text: (value: string) => translateText(value) } });
  const start = source.indexOf('let draftStatus = '), end = source.indexOf('\nasync function ensureConversation', start);
  vm.runInContext(source.slice(start, end), context);
  context.showDraftStatus('Saving draft…', 'saving');
  assert.equal(label.dataset.state, 'saving');
  context.showDraftStatus('Draft saved', 'saved');
  assert.equal(label.dataset.state, 'saved');
  assert.doesNotMatch(label.textContent, /[\u0e00-\u0e7f]/);
  context.showDraftStatus('Not saved · connection lost', 'error');
  assert.equal(label.dataset.state, 'error');
});
