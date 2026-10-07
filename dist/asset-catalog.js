import { availableTimeframes } from './timeframes.js';
export const exchanges = ['Binance', 'Bybit', 'OKX', 'Bitget', 'MEXC'];
export const categories = [
  ['crypto', 'คริปโต'], ['stocks', 'หุ้น'], ['etf', 'ETF'], ['forex', 'Forex'],
  ['commodities', 'ทองและสินค้าโภคภัณฑ์'], ['indices', 'ดัชนี'], ['futures', 'Futures'],
];
// ponytail: stable preference among native feeds; add liquidity ranking when comparable metrics exist.
// Never silently switch saved targets.
export function mergeCatalogs(catalogs, market) {
  const items = new Map();
  for (const exchange of exchanges) {
    const catalog = catalogs.find(c => c.exchange === exchange);
    for (const item of catalog?.items ?? []) {
      if (!item.supported) continue;
      const row = items.get(item.symbol) ?? { symbol: item.symbol, base: item.symbol.split('/')[0], quote: item.symbol.split('/')[1], market, sources: [] };
      row.sources.push(exchange);
      items.set(item.symbol, row);
    }
  }
  return [...items.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
}
export function selectTargets(items, pairs, source = 'auto', frames = []) {
  return pairs.flatMap(pair => {
    const item = items.find(m => m.symbol === pair);
    const sources = item?.sources.filter(exchange => frames.every(frame => availableTimeframes([exchange], item.market).includes(frame))) ?? [];
    const selected = source === 'all' ? sources : source === 'auto' ? sources.slice(0, 1) : sources.filter(exchange => exchange === source);
    if (!selected.length) throw new Error(`${pair} ไม่มีแหล่งข้อมูลที่รองรับตลาดและไทม์เฟรมนี้`);
    return selected.map(exchange => ({ exchange, pair }));
  });
}
export function strategyTargets(spec) {
  return spec.targets ?? spec.exchange.flatMap(exchange => spec.pairs.map(pair => ({ exchange, pair })));
}
