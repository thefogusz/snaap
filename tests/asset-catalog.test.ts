import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeCatalogs, selectTargets, strategyTargets, instrumentMetadata } from '../dist/asset-catalog.js';
import { availableTimeframes } from '../dist/timeframes.js';
import { strategySchema } from '../src/domain/engine.js';
import { subscriptionsFor } from '../src/realtime.js';
import { monitorBatches, splitMonitorTargets } from '../src/monitor-batches.js';
import { assetCatalog, validateTargets } from '../src/markets.js';

test('native asset classes preserve stock tokens and do not confuse matching crypto tickers', () => {
  const meta = (exchange: string, info: any, base = 'TSLA', market = 'Perpetual Futures') => instrumentMetadata(exchange, { base, info }, market);
  assert.equal(meta('Binance', { underlyingType: 'EQUITY' }).category, 'stocks');
  assert.equal(meta('Bybit', { symbolType: 'ETF' }).category, 'stocks');
  assert.equal(meta('Bybit', { symbolType: 'xstocks' }, 'TSLAx', 'Spot').product, 'tokenized_stock');
  assert.equal(meta('OKX', { instCategory: '4' }, 'XAU').category, 'metals');
  assert.equal(meta('Bitget', { symbolType: 'stock' }).category, 'stocks');
  assert.equal(meta('Bitget', {}).category, 'other');
  assert.equal(meta('Bitget', { symbolType: 'crypto', isRwa: 'YES' }, 'EURUSD').category, 'other');
  assert.equal(meta('MEXC', { conceptPlate: ['mc-trade-zone-stockindex'] }).category, 'stocks');
  assert.equal(meta('Gate', { contract_type: 'forex' }, 'EURUSD').category, 'forex');
  assert.equal(meta('Gate', { contract_type: 'commodities' }, 'WTI').category, 'commodities');
  const items = mergeCatalogs([
    { exchange: 'Binance', items: [{ symbol: 'TSLA/USDT', supported: true, ...meta('Binance', { underlyingType: 'COIN' }) }] },
    { exchange: 'Gate', items: [{ symbol: 'TSLA/USDT', supported: true, ...meta('Gate', { contract_type: 'stocks' }) }] },
  ], 'Perpetual Futures');
  assert.equal(items.length, 2);
  assert.throws(() => selectTargets(items, ['TSLA/USDT']), /หลาย/);
  assert.deepEqual(selectTargets(items.filter(m => m.category === 'stocks'), ['TSLA/USDT']), [{ exchange: 'Gate', pair: 'TSLA/USDT' }]);
  assert.ok(availableTimeframes(['Gate'], 'Spot').includes('1w'));
  assert.ok(!availableTimeframes(['Gate'], 'Perpetual Futures').includes('1w'));
  assert.ok(!availableTimeframes(['Gate']).includes('6h'));
});

test('union catalog preserves venue-only coins and selects only actual source/pair combinations', () => {
  const catalogs = [
    { exchange: 'Binance', items: [{ symbol: 'BTC/USDT', supported: true }, { symbol: 'BAD/USDT', supported: false }] },
    { exchange: 'MEXC', items: [{ symbol: 'BTC/USDT', supported: true }, { symbol: 'RARE/USDT', supported: true }] },
  ];
  const items = mergeCatalogs(catalogs, 'Spot');
  assert.equal(items.length, 2);
  assert.deepEqual(items[0].sources, ['Binance', 'MEXC']);
  assert.deepEqual(selectTargets(items, ['BTC/USDT', 'RARE/USDT']), [
    { exchange: 'Binance', pair: 'BTC/USDT' }, { exchange: 'MEXC', pair: 'RARE/USDT' },
  ]);
  const targets = selectTargets(items, ['BTC/USDT', 'RARE/USDT'], 'all');
  const spec = strategySchema.parse({ schemaVersion: 2, name: 'union', exchange: ['Binance', 'MEXC'], market: 'Spot', side: 'SPOT', pairs: ['BTC/USDT', 'RARE/USDT'], targets, timeframe: '1h', entry: { kind: 'COMPARE', op: '>', left: { kind: 'PRICE', field: 'close', timeframe: '1h' }, right: { kind: 'CONSTANT', value: 0 } }, stages: [], cooldownBars: 0, destinations: [] });
  assert.deepEqual(strategyTargets(spec), targets);
  assert.equal(subscriptionsFor([{ id: 'a', revision: 1, spec }]).size, 3);
  assert.equal(monitorBatches([{ id: 'a', revision: 1, spec }], new Map()).total, 3);
  for (const invalid of [[], [...targets, targets[0]], [{ exchange: 'OKX', pair: 'BTC/USDT' }], targets.filter(t => t.pair !== 'RARE/USDT')])
    assert.equal(strategySchema.safeParse({ ...spec, targets: invalid }).success, false);
  assert.deepEqual(strategyTargets({ exchange: ['Binance'], pairs: ['BTC/USDT'] }), [{ exchange: 'Binance', pair: 'BTC/USDT' }]);
  assert.throws(() => selectTargets(items, ['BAD/USDT']));
  assert.throws(() => selectTargets(items, ['RARE/USDT'], 'Binance'));
});

test('catalog survives an unavailable venue and validation never invents cross-product targets', async () => {
  const read = async (exchange: any) => {
    if (exchange === 'OKX') throw new Error('offline');
    return { at: 123, items: (exchange === 'MEXC' ? ['RARE/USDT'] : ['BTC/USDT']).map(symbol => ({ symbol, supported: true })) };
  };
  const catalog = await assetCatalog('Spot', false, read);
  assert.equal(catalog.sources.find(s => s.exchange === 'OKX')?.status, 'UNAVAILABLE');
  assert.deepEqual(catalog.items.find(s => s.symbol === 'RARE/USDT')?.sources, ['MEXC']);
  const spec = { exchange: ['Binance', 'MEXC'], market: 'Spot', pairs: ['BTC/USDT', 'RARE/USDT'], targets: [{ exchange: 'Binance', pair: 'BTC/USDT' }, { exchange: 'MEXC', pair: 'RARE/USDT' }] } as any;
  await validateTargets(spec, read);
  await assert.rejects(validateTargets({ ...spec, targets: undefined }, read), /ไม่พร้อม/);
  await assert.rejects(assetCatalog('Spot', false, async () => { throw new Error('offline'); }), /ไม่สำเร็จ/);
  assert.throws(() => selectTargets(catalog.items, ['RARE/USDT'], 'auto', ['2h']));
});

test('Gate stock setups share one native stream while keeping independent monitor targets', () => {
  const spec = strategySchema.parse({ schemaVersion: 2, name: 'Stock perpetual', exchange: ['Gate'], market: 'Perpetual Futures', side: 'LONG', pairs: ['TSLA/USDT'], targets: [{ exchange: 'Gate', pair: 'TSLA/USDT' }], timeframe: '1h', entry: { kind: 'COMPARE', op: '>', left: { kind: 'PRICE', field: 'close', timeframe: '1h' }, right: { kind: 'CONSTANT', value: 100 } }, stages: [], cooldownBars: 0, destinations: [] });
  const rows = Array.from({ length: 1000 }, (_, i) => ({ id: String(i), revision: 1, spec }));
  const subscriptions = subscriptionsFor(rows);
  assert.equal(subscriptions.size, 1);
  assert.equal([...subscriptions.values()][0].targets.length, 1000);
  const batches = monitorBatches(rows, new Map());
  assert.equal(batches.total, 1000);
  assert.ok([...batches.groups.values()].flatMap(targets => splitMonitorTargets(targets)).every(targets => targets.length <= 32));
  assert.equal(strategySchema.safeParse({ ...spec, timeframe: '1w' }).success, false);
});
