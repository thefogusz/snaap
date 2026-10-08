import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import iciReports from './data/ici-flows.json' with { type: 'json' };

const listing = 'https://www.ici.org/research/statistics/mutual-funds/quarterly-worldwide-mutual-fund-market';
const weekly = 'https://www.ici.org/research/stats/combined_flows';
type Universe = 'global' | 'us';
export type FlowDataset = {
  universe: Universe; source: string; publishedAt: string; retrievedAt: string;
  quality: 'reported' | 'estimated'; periods: string[]; total: (number | null)[];
  markets: { id: string; name: string; values: (number | null)[] }[];
};
const globalMarkets = [['equity', 'Equity'], ['bond', 'Bond'], ['mixed', 'Balanced/Mixed'], ['cash', 'Money market'], ['property', 'Real Estate'], ['other', 'Other'], ['guaranteed', 'Guaranteed']];
const usMarkets = [['equity', 'Equity'], ['bond', 'Bond'], ['mixed', 'Hybrid'], ['commodity', 'Commodity']];
const plain = (s: string) => s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

// ponytail: deliberately supports ICI's two published table layouts; fail closed if they change.
export function parseFlows(html: string, universe: Universe, source: string, now = new Date()): FlowDataset {
  const article = html.slice(html.indexOf('<h1'));
  const publishedAt = article.match(/<time\b[^>]*datetime="([^"]+)"/)?.[1];
  if (!publishedAt || !Number.isFinite(Date.parse(publishedAt))) throw new Error('Missing publication date');
  if (Date.parse(publishedAt) > now.getTime()) throw new Error('Future publication date');
  const tables = [...article.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)];
  const global = universe === 'global';
  if (tables.length !== (global ? 2 : 1)) throw new Error('ICI table layout changed');
  const table = tables[global ? 1 : 0];
  if (global) {
    const after = plain(article.slice(table.index! + table[0].length, table.index! + table[0].length + 3000));
    if (!after.includes('Net sales are new sales') || !/Billions of US dollars/.test(article)) throw new Error('Unverified net sales table');
  } else if (!/Estimated Fund Flows[\s\S]{0,100}Millions of dollars/.test(article)) throw new Error('Unverified weekly units');
  const rows = [...table[0].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(r => [...r[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c => plain(c[1])));
  let periods: string[];
  if (global) {
    const years = rows[0].filter(v => /^20\d\d$/.test(v));
    const quarters = rows[1];
    if (!years.length || !quarters.every(v => /^Q[1-4]$/.test(v))) throw new Error('Invalid quarters');
    let yearIndex = 0;
    periods = quarters.map((q, i) => {
      if (i && q === 'Q1') yearIndex++;
      if (!years[yearIndex]) throw new Error('Invalid years');
      return `${years[yearIndex]} ${q}`;
    });
    if (yearIndex !== years.length - 1) throw new Error('Year mismatch');
    const ref = source.match(/ww_q([1-4])_(\d{2})$/);
    if (!ref || periods.at(-1) !== `20${ref[2]} Q${ref[1]}`) throw new Error('Report period mismatch');
  } else {
    periods = rows[0].slice(1).map(v => {
      const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(20\d\d)$/);
      if (!m) throw new Error('Invalid weekly date');
      const iso = `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
      if (new Date(iso).toISOString().slice(0, 10) !== iso) throw new Error('Invalid date');
      return iso;
    }).reverse();
  }
  if (periods.length < 2 || new Set(periods).size !== periods.length || periods.some((p, i) => i > 0 && p <= periods[i - 1])) throw new Error('Invalid period order');
  const lastPeriod = periods.at(-1)!;
  const periodEnd = global ? new Date(Date.UTC(Number(lastPeriod.slice(0,4)),Number(lastPeriod.at(-1))*3,0)).toISOString().slice(0,10) : lastPeriod;
  if (periodEnd > publishedAt.slice(0,10)) throw new Error('Observation after publication');
  const values = (label: string) => {
    const matches = rows.filter(r => r[0] === label);
    if (matches.length !== 1 || matches[0].length !== periods.length + 1) throw new Error(`Missing/changed row ${label}`);
    const numbers = matches[0].slice(1).map(v => {
      if (v === '*' && global) return null; // Rounded small amounts have unknown sign, never treat as zero.
      if (!/^-?(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(v)) throw new Error('Invalid flow value');
      const n = Number(v.replaceAll(',', '')) * (global ? 1e9 : 1e6);
      if (!Number.isSafeInteger(n)) throw new Error('Flow value out of range');
      return n;
    });
    return global ? numbers : numbers.reverse();
  };
  const total = values(global ? 'All funds*' : 'Total');
  const markets = (global ? globalMarkets : usMarkets).map(([id, name]) => ({ id, name, values: values(name) }));
  // Only mutually exclusive top-level categories; exclude ETF memo rows and subcategories.
  total.forEach((v, i) => {
    const sum = markets.reduce((n, m) => n + (m.values[i] ?? 0), 0);
    if (v === null || Math.abs(sum - v) > markets.length * (global ? 1e9 : 1e6)) throw new Error('Categories do not reconcile');
  });
  return { universe, source, publishedAt, retrievedAt: now.toISOString(), quality: global ? 'reported' : 'estimated', periods, total, markets };
}

async function getHtml(url: string, contentType = 'text/html') {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'error', headers: { Accept: contentType } });
  if (!response.ok) throw new Error(`Source HTTP ${response.status} (${new URL(url).hostname})`);
  if (!response.headers.get('content-type')?.includes(contentType)) throw new Error(`Unexpected source content type (${new URL(url).hostname})`);
  let html = '';
  const decoder = new TextDecoder();
  for await (const chunk of response.body!) {
    html += decoder.decode(chunk, { stream: true });
    if (html.length > 2_000_000) throw new Error('Source too large');
  }
  return html + decoder.decode();
}

const goldSource = 'https://www.gold.org/goldhub/data/global-gold-backed-etf-holdings-and-flows';
// Public chart endpoint embedded by WGC on the source page (not its private holdings endpoints).
const goldApi = 'https://fsapi.gold.org/api/v11/charts/etfv2/revised/flows-chart2?break-cache=25Jul22';
const goldSeries = z.object({ series: z.object({ usd: z.array(z.object({ name: z.string(), type: z.string(), yAxis: z.number(), data: z.array(z.tuple([z.number().int().nonnegative(), z.number().finite()])) })) }) });
const goldSchema = z.object({ chartData: z.object({ asOfDate: z.iso.date(), data: z.object({ Monthly: goldSeries, Weekly: goldSeries.optional() }) }) });
export function parseGold(input: unknown) {
  const { chartData } = goldSchema.parse(input);
  const today = new Date().toISOString().slice(0,10);
  if (chartData.asOfDate > today) throw new Error('Future gold observation');
  const candidates = (['Monthly','Weekly'] as const).flatMap(cadence => {
    const series = chartData.data[cadence];
    if (!series) return [];
    const regions = ['North America', 'Europe', 'Asia', 'Other'].map(name => {
      const matches = series.series.usd.filter(s => s.name === name && s.type === 'column' && s.yAxis === 0);
      if (matches.length !== 1 || matches[0].data.length < 6) throw new Error('Gold flow regions changed');
      return matches[0].data.slice(-6);
    });
    const history = regions[0].map(([time], i) => {
      const period = new Date(time).toISOString().slice(0, 10);
      if (period > today || (i && time <= regions[0][i - 1][0])) throw new Error('Gold period mismatch');
      if (regions.some(r => r[i]?.[0] !== time)) throw new Error('Gold region dates differ');
      return { period, value: Math.round(regions.reduce((sum, r) => sum + r[i][1], 0)) };
    });
    if (cadence === 'Monthly' && history.at(-1)!.period !== chartData.asOfDate) throw new Error('Gold data incomplete');
    return [{ cadence: cadence.toLowerCase(), history }];
  });
  // Prefer the series with the newest observation; equal dates prefer weekly freshness.
  candidates.sort((a,b) => b.history.at(-1)!.period.localeCompare(a.history.at(-1)!.period) || (a.cadence === 'weekly' ? -1 : 1));
  return { id: 'gold', source: goldSource, sourceName: 'World Gold Council', ...candidates[0], mode: 'connected', retrievedAt: new Date().toISOString() };
}

const cryptoSource = 'https://defillama.com/stablecoins';
const fearSource = 'https://alternative.me/crypto/fear-and-greed-index/';
const stableSchema = z.array(z.object({ date: z.string().regex(/^\d+$/), totalCirculating: z.object({ peggedUSD: z.number().finite().nonnegative() }) })).min(8);
export function parseStablecoins(input: unknown) {
  // Native USD-pegged supply, NOT price-valued market cap; other peg currencies excluded.
  const rows = stableSchema.parse(input).slice(-8);
  const history = rows.slice(1).map((row, i) => {
    const time = Number(row.date) * 1000;
    if (time > Date.now() || Number(row.date) - Number(rows[i].date) !== 86400) throw new Error('Stablecoin dates changed');
    return { period: new Date(time).toISOString().slice(0,10), value: Math.round(row.totalCirculating.peggedUSD - rows[i].totalCirculating.peggedUSD) };
  });
  return { id: 'crypto', source: cryptoSource, sourceName: 'DefiLlama', cadence: 'daily', mode: 'connected', history, supply: rows.at(-1)!.totalCirculating.peggedUSD, retrievedAt: new Date().toISOString() };
}
const fearSchema = z.object({ data: z.array(z.object({ value: z.string().regex(/^\d{1,3}$/), value_classification: z.enum(['Extreme Fear','Fear','Neutral','Greed','Extreme Greed']), timestamp: z.string().regex(/^\d+$/) })).min(1), metadata: z.object({ error: z.null() }) });
export function parseFear(input: unknown) {
  const row = fearSchema.parse(input).data[0], value = Number(row.value), time = Number(row.timestamp)*1000;
  if (value > 100 || time > Date.now()) throw new Error('Invalid sentiment index');
  return { id: 'fear', source: fearSource, sourceName: 'Alternative.me', value, classification: row.value_classification, period: new Date(time).toISOString().slice(0,10), retrievedAt: new Date().toISOString() };
}

export const dailyMarkets = [
  { id: 'spy', symbol: 'SPY', name: 'หุ้นสหรัฐ', description: 'S&P 500 · SPY ETF', category: 'equity', tradingView: 'AMEX:SPY' },
  { id: 'efa', symbol: 'EFA', name: 'หุ้นตลาดพัฒนาแล้ว', description: 'นอกสหรัฐ · EFA ETF', category: 'equity', tradingView: 'AMEX:EFA' },
  { id: 'eem', symbol: 'EEM', name: 'หุ้นตลาดเกิดใหม่', description: 'Emerging markets · EEM ETF', category: 'equity', tradingView: 'AMEX:EEM' },
  { id: 'tlt', symbol: 'TLT', name: 'พันธบัตรสหรัฐ', description: 'อายุ 20 ปีขึ้นไป · TLT ETF', category: 'bond', tradingView: 'NASDAQ:TLT' },
  { id: 'gld', symbol: 'GLD', name: 'ทองคำ', description: 'ทองคำผ่าน GLD ETF', category: 'gold', tradingView: 'AMEX:GLD' },
  { id: 'uso', symbol: 'USO', name: 'น้ำมัน', description: 'WTI futures · USO ETF', category: 'commodity', tradingView: 'AMEX:USO' },
  { id: 'vnq', symbol: 'VNQ', name: 'อสังหาริมทรัพย์', description: 'US REITs · VNQ ETF', category: 'property', tradingView: 'AMEX:VNQ' },
  { id: 'uup', symbol: 'UUP', name: 'ดอลลาร์สหรัฐ', description: 'Dollar futures · UUP ETF', category: 'currency', tradingView: 'AMEX:UUP' },
  { id: 'btc', symbol: 'BTC-USD', name: 'Bitcoin', description: 'BTC / USD · Coinbase', category: 'crypto', tradingView: 'COINBASE:BTCUSD' },
  { id: 'eth', symbol: 'ETH-USD', name: 'Ethereum', description: 'ETH / USD · Coinbase', category: 'crypto', tradingView: 'COINBASE:ETHUSD' },
];
type DailyPoint = { date: string; close: number; provisional: boolean };
const quoteSchema = z.object({ chart: z.object({ error: z.null(), result: z.array(z.object({
  meta: z.object({ symbol: z.string(), currency: z.literal('USD'), exchangeTimezoneName: z.string(), regularMarketTime: z.number().int().positive(), currentTradingPeriod: z.object({ regular: z.object({ end: z.number().int() }) }).optional() }),
  timestamp: z.array(z.number().int().positive()), indicators: z.object({ quote: z.array(z.object({ close: z.array(z.number().finite().positive().nullable()) })).length(1) }),
})).length(1) }) });
export function parseDailyQuotes(input: unknown, symbol: string, now = Date.now()) {
  const row = quoteSchema.parse(input).chart.result[0];
  if (row.meta.symbol !== symbol || row.timestamp.length !== row.indicators.quote[0].close.length || row.meta.regularMarketTime*1000 > now+60000) throw new Error('Daily quote identity or time mismatch');
  const localDate = (time: number) => new Intl.DateTimeFormat('en-CA',{timeZone:row.meta.exchangeTimezoneName,year:'numeric',month:'2-digit',day:'2-digit'}).format(time);
  const end = (row.meta.currentTradingPeriod?.regular.end ?? 0)*1000;
  const history: DailyPoint[] = [];
  row.timestamp.forEach((time,i)=>{
    if (time*1000 > now || (i && time <= row.timestamp[i-1])) throw new Error('Daily quote chronology changed');
    const close = row.indicators.quote[0].close[i];
    if(close !== null) history.push({date:localDate(time*1000),close,provisional:end>now && localDate(end)===localDate(time*1000)});
  });
  if(history.length<8 || new Set(history.map(p=>p.date)).size!==history.length) throw new Error('Insufficient daily quotes');
  return { history, source: `https://finance.yahoo.com/quote/${symbol}/history/`, sourceName: 'Yahoo Finance', observedAt: new Date(row.meta.regularMarketTime*1000).toISOString(), timezone: row.meta.exchangeTimezoneName };
}
const candleSchema = z.array(z.tuple([z.number().int().positive(),z.number().finite().positive(),z.number().finite().positive(),z.number().finite().positive(),z.number().finite().positive(),z.number().finite().nonnegative()])).min(8);
export function parseCryptoCandles(input: unknown, symbol: string, now = Date.now()) {
  const rows = candleSchema.parse(input).sort((a,b)=>a[0]-b[0]);
  if(new Set(rows.map(r=>r[0])).size!==rows.length) throw new Error('Duplicate daily candle');
  const history = rows.map(([time,low,high,open,close])=>{
    if(time*1000>now || time%86400!==0 || low>Math.min(open,close) || high<Math.max(open,close) || low>high) throw new Error('Invalid daily candle');
    return {date:new Date(time*1000).toISOString().slice(0,10),close,provisional:(time+86400)*1000>now};
  });
  return { history:history.slice(-32), source: `https://www.coinbase.com/advanced-trade/spot/${symbol}`, sourceName:'Coinbase Exchange', observedAt:null, timezone:'UTC' };
}

export function dailyWindow(history: DailyPoint[], now = Date.now()) {
  const today = new Date(now).toISOString().slice(0,10);
  const dates = Array.from({length:7},(_,i)=>new Date(Date.parse(today)-(6-i)*86400000).toISOString().slice(0,10));
  const baseline = history.findLast(p=>p.date<dates[0]);
  const latest = history.at(-1)!;
  const days = dates.map(date=>{
    const index=history.findIndex(p=>p.date===date), point=history[index], previous=history[index-1];
    return {date,close:point?.close??null,change:point&&previous?(point.close/previous.close-1)*100:null,relative:point&&baseline?(point.close/baseline.close-1)*100:null,provisional:point?.provisional??false};
  });
  return {days,latest,change7:baseline&&latest.date>=dates[0]?(latest.close/baseline.close-1)*100:null};
}

const cryptoMarketSchema = z.array(z.object({
  id:z.string().min(1),symbol:z.string().min(1),name:z.string().min(1),market_cap:z.number().finite().nonnegative().nullable(),
  market_cap_change_24h:z.number().finite().nullable(),price_change_percentage_24h:z.number().finite().nullable(),last_updated:z.string().nullable(),
})).min(3).max(250);
const stableListSchema=z.array(z.object({id:z.string(),market_cap:z.number().finite().nonnegative().nullable()})).min(1).max(250);
export function parseCryptoBreakdown(input:unknown,stableInput:unknown,now=Date.now()){
  const raw=cryptoMarketSchema.parse(input),stableRows=stableListSchema.parse(stableInput);
  if(new Set(raw.map(r=>r.id)).size!==raw.length)throw Error('Duplicate crypto asset');
  const floor=Math.min(...raw.flatMap(r=>r.market_cap?[r.market_cap]:[]));
  if(stableRows.length===250&&(stableRows.at(-1)!.market_cap??Infinity)>floor)throw Error('Incomplete stablecoin classification');
  const stableIds=new Set(stableRows.map(r=>r.id));
  const coins=raw.filter(r=>!stableIds.has(r.id)&&r.market_cap&&r.market_cap_change_24h!==null&&r.last_updated&&Number.isFinite(Date.parse(r.last_updated))&&Date.parse(r.last_updated)<=now+60000&&now-Date.parse(r.last_updated)<=6*3600000).map(r=>({id:r.id,symbol:r.symbol.toUpperCase(),name:r.name,cap:r.market_cap!,delta:r.market_cap_change_24h!,priceChange:r.price_change_percentage_24h,updatedAt:r.last_updated!}));
  if(!coins.some(c=>c.id==='bitcoin')||!coins.some(c=>c.id==='ethereum')||coins.length<3||coins.some(c=>c.cap-c.delta<=0))throw Error('Crypto coverage incomplete');
  const summarize=(members:typeof coins)=>{
    const cap=members.reduce((n,c)=>n+c.cap,0),delta=members.reduce((n,c)=>n+c.delta,0);
    return {cap,delta,change:cap-delta>0?delta/(cap-delta)*100:null,gain:members.reduce((n,c)=>n+Math.max(0,c.delta),0),loss:members.reduce((n,c)=>n+Math.max(0,-c.delta),0)};
  };
  const total=summarize(coins);
  const groups=[['bitcoin','Bitcoin'],['ethereum','Ethereum'],['altcoins','Altcoins']].map(([id,name])=>{
    const members=coins.filter(c=>id==='altcoins'?!['bitcoin','ethereum'].includes(c.id):c.id===id);
    return {id,name,...summarize(members),coins:members.sort((a,b)=>b.cap-a.cap)};
  });
  return {...total,groups,count:coins.length,excluded:raw.length-coins.length,observedAt:coins.map(c=>c.updatedAt).sort()[0],source:'https://www.coingecko.com/',sourceName:'CoinGecko',stale:false};
}

export const sentimentQuerySchema = z.object({dataset:z.enum(['us-flows','global-flows','daily','specialists','crypto-breakdown'])}).strict();
const sentimentNotes = {
  'us-flows':'USD net flows of US long-term mutual funds and ETF net issuance, weekly; excludes money-market funds. Not all US capital flows or daily flows.',
  'global-flows':'USD net sales of regulated open-end funds, quarterly, including reinvested dividends. Not all global capital or transfers between markets. Do not add to US flows.',
  daily:'Reference ETF and Coinbase BTC/ETH close-price returns, not fund flows or dividend-adjusted total returns. days covers seven UTC calendar dates; ETF dates use exchange timezone. Missing dates stay null; provisional bars are unfinished. change and change7 are percentages.',
  specialists:'Gold: actual global physically backed ETF net flows in USD at the reported cadence. crypto: change in native USD-pegged stablecoin supply, not BTC/ETH flows or proven new money. fear: daily Bitcoin Fear & Greed index 0–100, not fund flows. Per-feed errors mean unavailable.',
  'crypto-breakdown':'CoinGecko top-100 coverage excluding classified stablecoins; BTC, ETH and remaining altcoins. cap/delta/gain/loss are USD market capitalization, not cash flows; change is percent over rolling 24h. Contribution to rising value uses positive delta/gain; to falling value uses absolute negative delta/loss. Neither is trading volume or proof of money entering/leaving crypto.',
};

export function registerSentiment(app: FastifyInstance) {
  let cryptoData:ReturnType<typeof parseCryptoBreakdown>|undefined,cryptoChecked=0,cryptoFailed=false,cryptoPending:Promise<void>|undefined;
  async function readCrypto(){
    if(Date.now()-cryptoChecked>(cryptoFailed?60000:15*60000)){
      cryptoPending??=(async()=>{
        try{
          const base='https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&page=1&sparkline=false';
          const [markets,stable]=await Promise.all([getHtml(base+'&per_page=100','application/json'),getHtml(base+'&category=stablecoins&per_page=250','application/json')]);
          cryptoData=parseCryptoBreakdown(JSON.parse(markets),JSON.parse(stable));cryptoFailed=false;
        }catch(error){cryptoFailed=true;app.log.warn({err:error},'Crypto breakdown source unavailable');}
        finally{cryptoChecked=Date.now();cryptoPending=undefined;}
      })();
    }
    await cryptoPending;
    if(!cryptoData)return {error:'ยังอ่านองค์ประกอบคริปโตไม่ได้'};
    return {...cryptoData,stale:cryptoFailed,checkedAt:new Date(cryptoChecked).toISOString()};
  }
  type DailyData = ReturnType<typeof parseDailyQuotes> | ReturnType<typeof parseCryptoCandles>;
  const dailyCache = new Map<string,{data?:DailyData;checked:number;failed?:boolean;pending?:Promise<void>}>();
  async function readDaily(){
    const markets = await Promise.all(dailyMarkets.map(async market=>{
      let entry=dailyCache.get(market.id);
      if(!entry){entry={checked:0};dailyCache.set(market.id,entry);}
      const current=entry,crypto=market.category==='crypto';
      if(Date.now()-current.checked>(current.failed?60000:5*60000)){
        current.pending??=(async()=>{
          try{
            const url=crypto?`https://api.exchange.coinbase.com/products/${market.symbol}/candles?granularity=86400`:`https://query1.finance.yahoo.com/v8/finance/chart/${market.symbol}?range=1mo&interval=1d`;
            const raw=JSON.parse(await getHtml(url,'application/json'));
            current.data=crypto?parseCryptoCandles(raw,market.symbol):parseDailyQuotes(raw,market.symbol);current.failed=false;
          }catch(error){current.failed=true;app.log.warn({err:error,symbol:market.symbol},'Daily market source unavailable');}
          finally{current.checked=Date.now();current.pending=undefined;}
        })();
      }
      await current.pending;
      return {...market,...current.data,...(current.data?dailyWindow(current.data.history):{}),stale:!!current.failed,checkedAt:new Date(current.checked).toISOString(),...(!current.data?{error:'ยังอ่านราคาต้นทางไม่ได้'}:{})};
    }));
    return {markets,retrievedAt:new Date().toISOString()};
  }
  const feeds = [
    { id: 'gold', source: goldSource, url: goldApi, parse: parseGold, ttl: 3600000 },
    { id: 'crypto', source: cryptoSource, url: 'https://stablecoins.llama.fi/stablecoincharts/all', parse: parseStablecoins, ttl: 15*60000 },
    { id: 'fear', source: fearSource, url: 'https://api.alternative.me/fng/?limit=1', parse: parseFear, ttl: 15*60000 },
  ];
  type Specialist = ReturnType<typeof parseGold> | ReturnType<typeof parseStablecoins> | ReturnType<typeof parseFear>;
  const specialistCache = new Map<string, { data?: Specialist; checked: number; failed?: boolean; pending?: Promise<void> }>();
  async function readSpecialists(){
    const results = await Promise.all(feeds.map(async feed => {
      let entry = specialistCache.get(feed.id);
      if (!entry) { entry = { checked: 0 }; specialistCache.set(feed.id, entry); }
      const current = entry;
      if (Date.now() - current.checked > (current.failed ? 60000 : feed.ttl)) {
        current.pending ??= (async () => {
          try { current.data = feed.parse(JSON.parse(await getHtml(feed.url, 'application/json'))); current.failed = false; }
          catch (error) { current.failed = true; app.log.warn({ err: error, feed: feed.id }, 'Sentiment source unavailable'); }
          finally { current.checked = Date.now(); current.pending = undefined; }
        })();
      }
      await current.pending;
      return [feed.id, current.data ? { ...current.data, stale: !!current.failed, checkedAt: new Date(current.checked).toISOString() } : { id: feed.id, source: feed.source, error: 'อ่านข้อมูลต้นทางไม่สำเร็จ กรุณาลองอีกครั้ง' }];
    }));
    return Object.fromEntries(results);
  }
  const cache = new Map<Universe, { data?: FlowDataset; checked: number; pending?: Promise<void>; failed?: boolean }>();
  async function readFlows(universe:Universe){
    let entry = cache.get(universe);
    if (!entry) { entry = { checked: 0 }; cache.set(universe, entry); }
    const current = entry;
    if (Date.now() - current.checked > (current.failed ? 60000 : 6 * 3600000)) {
      current.pending ??= (async () => {
        try {
          let source = weekly;
          if (universe === 'global') {
            const html = await getHtml(listing);
            const refs = [...new Set(html.match(/\/statistical-report\/ww_q[1-4]_\d{2}\b/g) ?? [])];
            refs.sort((a, b) => Number(b.slice(-2)) - Number(a.slice(-2)) || b.localeCompare(a));
            if (!refs.length) throw new Error('No worldwide release');
            source = `https://www.ici.org${refs[0]}`;
          }
          current.data = parseFlows(await getHtml(source), universe, source);
          current.failed = false;
        } catch (error) {
          current.failed = true;
          // Fastify request logging is disabled in production.
          console.warn('Sentiment source refresh failed', universe, error instanceof Error ? error.message.slice(0, 500) : 'Unknown error');
        } finally { current.checked = Date.now(); current.pending = undefined; }
      })();
    }
    await current.pending;
    // Verified published reports survive a cold start when ICI denies cloud-host requests.
    return { ...(current.data ?? iciReports[universe]), stale: !!current.failed, checkedAt: new Date(current.checked).toISOString() };
  }
  app.get('/api/v1/sentiment/crypto-breakdown',async(_req,reply)=>{
    reply.header('Cache-Control','private, no-store');
    const data=await readCrypto();
    if('error' in data)reply.code(503);
    return data;
  });
  app.get('/api/v1/sentiment/daily',async(_req,reply)=>{
    reply.header('Cache-Control','private, no-store');
    return readDaily();
  });
  app.get('/api/v1/sentiment/specialists',async(_req,reply)=>{
    reply.header('Cache-Control','private, no-store');
    return readSpecialists();
  });
  app.get<{Querystring:{universe?:string}}>('/api/v1/sentiment',async(req,reply)=>{
    const universe=req.query.universe??'global';
    if(universe!=='global'&&universe!=='us')return reply.code(400).send({error:'Invalid universe'});
    reply.header('Cache-Control','private, no-store');
    return readFlows(universe);
  });
  return async function readSentiment(input:unknown){
    const {dataset}=sentimentQuerySchema.parse(input);
    const readers={'us-flows':()=>readFlows('us'),'global-flows':()=>readFlows('global'),daily:readDaily,specialists:readSpecialists,'crypto-breakdown':readCrypto};
    return {dataset,data:await readers[dataset](),interpretation:sentimentNotes[dataset]};
  };
}
