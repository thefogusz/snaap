import { availableTimeframes } from './timeframes.js';
export const exchanges = ['Binance', 'Bybit', 'OKX', 'Bitget', 'MEXC', 'Gate'];
export const categories = [
  ['crypto', 'คริปโต'], ['stocks', 'หุ้น / ETF'], ['forex', 'Forex'],
  ['metals', 'โลหะ'], ['commodities', 'สินค้าโภคภัณฑ์'], ['indices', 'ดัชนี'], ['other', 'อื่น ๆ'],
];
// Provider taxonomy: never classify by ticker alone or substitute cash-market quotes.
export function instrumentMetadata(exchange, instrument, market) {
  const info = instrument.info ?? {}, metal = ['XAU', 'XAG', 'XPT', 'XPD'].includes(instrument.base);
  let category = 'other';
  if (exchange === 'Binance') {
    const type = info.underlyingType;
    category = type === 'COIN' || (market === 'Spot' && !type) ? 'crypto' : /EQUITY$/.test(type ?? '') ? 'stocks' : type === 'FX' ? 'forex' : type === 'INDEX' ? 'indices' : type === 'COMMODITY' ? (metal ? 'metals' : 'commodities') : 'other';
  } else if (exchange === 'Bybit') {
    const type = info.symbolType ?? '';
    category = ['stock', 'ETF', 'xstocks', 'mstocks'].includes(type) ? 'stocks' : type === 'forex' ? 'forex' : type === 'commodity' ? (metal ? 'metals' : 'commodities') : ['', 'innovation'].includes(type) ? 'crypto' : 'other';
  } else if (exchange === 'OKX') {
    category = ({ '1': 'crypto', '3': 'stocks', '4': metal ? 'metals' : 'commodities', '5': 'forex' })[info.instCategory] ?? (market === 'Spot' && !info.instCategory ? 'crypto' : 'other');
  } else if (exchange === 'Bitget') {
    // V3 sometimes labels RWA FX contracts as crypto; leave ambiguous metadata unclassified.
    category = info.isRwa === 'YES' && info.symbolType === 'crypto' ? 'other' : ({ crypto: 'crypto', stock: 'stocks', metal: 'metals', commodity: 'commodities', forex: 'forex', index: 'indices' })[info.symbolType] ?? (info.isReality === 'yes' ? 'stocks' : 'other');
  } else if (exchange === 'MEXC') {
    const plates = Array.isArray(info.conceptPlate) ? info.conceptPlate.join(' ').toLowerCase() : '';
    category = plates.includes('stock') ? 'stocks' : plates.includes('forex') ? 'forex' : plates.includes('metals') ? 'metals' : /oil|commodities/.test(plates) ? 'commodities' : plates.includes('tradfi') ? 'other' : 'crypto';
  } else if (exchange === 'Gate') {
    category = ({ stocks: 'stocks', indices: 'indices', commodities: 'commodities', forex: 'forex', metals: 'metals', '': 'crypto' })[info.contract_type ?? ''] ?? 'other';
  }
  const product = market === 'Spot' ? (category === 'stocks' ? 'tokenized_stock' : 'spot') : (category === 'crypto' ? 'crypto_perpetual' : 'reference_perpetual');
  const name = info.fullName ?? info.baseCoinName ?? '';
  const labels = exchange === 'Binance' ? info.underlyingSubType : exchange === 'MEXC' ? info.conceptPlate : null;
  const meme = Array.isArray(labels) ? labels.some(label => typeof label === 'string' && /(?:^|-)meme$/i.test(label)) : null;
  const launch = exchange === 'Binance' ? info.onboardDate : exchange === 'Bybit' ? info.launchTime : exchange === 'Gate' && info.launch_time ? Number(info.launch_time) * 1000 : null;
  const listedAt = launch !== null && Number.isSafeInteger(Number(launch)) && Number(launch) > 0 ? Number(launch) : null;
  return { category, product, name: typeof name === 'string' ? name.slice(0, 100) : '', meme, listedAt };
}
// Stable preference among available native feeds; never silently switch saved targets.
export function mergeCatalogs(catalogs, market) {
  const items = new Map();
  for (const exchange of exchanges) {
    const catalog = catalogs.find(c => c.exchange === exchange);
    for (const item of catalog?.items ?? []) {
      if (!item.supported) continue;
      const category = item.category ?? 'crypto', product = item.product ?? (market === 'Spot' ? 'spot' : 'crypto_perpetual');
      const id = `${category}:${product}:${item.symbol}`;
      const row = items.get(id) ?? { id, category, product, name: item.name ?? '', symbol: item.symbol, base: item.symbol.split('/')[0], quote: item.symbol.split('/')[1], market, sources: [] };
      row.sources.push(exchange);
      items.set(id, row);
    }
  }
  return [...items.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
}
export function selectTargets(items, pairs, source = 'auto', frames = []) {
  return pairs.flatMap(pair => {
    const matches = items.filter(m => m.symbol === pair);
    if (matches.length > 1) throw new Error(`${pair} มีหลายประเภทสินทรัพย์ กรุณาเลือกประเภทให้ชัดเจน`);
    const item = matches[0];
    const sources = item?.sources.filter(exchange => frames.every(frame => availableTimeframes([exchange], item.market).includes(frame))) ?? [];
    const selected = source === 'all' ? sources : source === 'auto' ? sources.slice(0, 1) : sources.filter(exchange => exchange === source);
    if (!selected.length) throw new Error(`${pair} ไม่มีแหล่งข้อมูลที่รองรับตลาดและไทม์เฟรมนี้`);
    return selected.map(exchange => ({ exchange, pair }));
  });
}
export function strategyTargets(spec) {
  return spec.targets ?? spec.exchange.flatMap(exchange => spec.pairs.map(pair => ({ exchange, pair })));
}
