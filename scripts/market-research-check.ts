import assert from 'node:assert/strict';
import { localDatabase } from './postgres.js';
import { database, migrate } from '../src/data/db.js';
import { observeCatalog } from '../src/markets.js';
import { screenAssets } from '../src/market-research.js';

const postgres = await localDatabase(), admin = database(postgres.url), schema = 'market_research_' + Date.now();
await admin.query(`CREATE SCHEMA "${schema}"`);
const url = new URL(postgres.url); url.searchParams.set('options', '-c search_path=' + schema);
const db = database(url.toString()), other = database(url.toString());
try {
  await migrate(db);
  const at = Date.now(), catalog = (symbols: string[], time = at) => ({ at: time, items: symbols.map(symbol => ({ symbol, supported: true })) });
  await observeCatalog(db, 'Binance', 'Spot', catalog([]));
  assert.equal((await db.query('SELECT count(*) n FROM market_catalog_sources')).rows[0].n, '0');
  await Promise.all(Array.from({ length: 100 }, (_, i) => observeCatalog(i % 2 ? db : other, 'Binance', 'Spot', catalog(['BTC/USDT']))));
  assert.equal((await db.query('SELECT count(*) n FROM market_listings WHERE NOT baseline')).rows[0].n, '0');
  await observeCatalog(db, 'Binance', 'Spot', catalog(['BTC/USDT', 'NEW/USDT'], at + 1));
  await observeCatalog(other, 'Binance', 'Spot', catalog(['BTC/USDT', 'NEW/USDT'], at + 2));
  await observeCatalog(other, 'Binance', 'Spot', catalog(['BTC/USDT', 'OLD/USDT'], at - 1));
  await observeCatalog(db, 'Binance', 'Perpetual Futures', catalog(['NEW/USDT'], at + 2));
  assert.equal((await db.query('SELECT count(*) n FROM market_listings WHERE NOT baseline')).rows[0].n, '1');
  const first = (await db.query("SELECT first_observed_at FROM market_listings WHERE market='Spot' AND pair='NEW/USDT'")).rows[0];
  assert.equal(new Date(first.first_observed_at).getTime(), at + 1);
  const reads = {
    instruments: async () => catalog(['BTC/USDT', 'NEW/USDT'], at + 3),
    tickers: async (exchange: any) => ({ exchange, fetchedAt: at, items: ['BTC/USDT', 'NEW/USDT'].map(pair => ({ pair, last: 100, quoteVolume: 200, changePercent: 2, providerTime: null })) }),
  };
  const query = { exchange: 'Binance', market: 'Spot', category:'crypto', theme:null, sort: 'new', limit: 10, minQuoteVolume: 0, excludeBases: [], newSinceDays: 7 };
  const result = await screenAssets(db, query, reads);
  assert.deepEqual(result.items.map(r => r.pair), ['NEW/USDT']);
  assert.match(result.listingMeaning!, /First observed/);
  const partial = await screenAssets(db, { ...query, exchange: 'all', sort: 'volume' }, {
    ...reads, tickers: async exchange => { if (exchange !== 'Binance') throw Error('offline'); return reads.tickers(exchange); },
  });
  assert.equal(partial.sources.filter(s => s.status === 'UNAVAILABLE').length, 5);
  await assert.rejects(screenAssets(db, query, { ...reads, tickers: async () => { throw Error('offline'); } }), /แหล่งข้อมูล/);
  console.log('PASS atomic baseline across pools, preserved first observation, market isolation, stale catalog rejection and partial provider failures');
} finally {
  await other.end(); await db.end();
  await admin.query(`DROP SCHEMA "${schema}" CASCADE`); await admin.end(); await postgres.stop();
}
