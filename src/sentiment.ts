import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
const cotSource = 'https://publicreporting.cftc.gov/d/6dca-aqww';
const cotApi = 'https://publicreporting.cftc.gov/resource/6dca-aqww.json';
const cotMarkets = [
  ['us-stocks', 'S&P 500', '13874A'], ['developed-stocks', 'MSCI EAFE', '244041'],
  ['emerging-stocks', 'MSCI EM', '244042'], ['bonds', 'UST 10Y', '043602'],
  ['gold', 'Gold', '088691'], ['oil', 'WTI crude', '067411'],
  ['bitcoin', 'Bitcoin', '133741'], ['ethereum', 'Ether', '146021'],
] as const;
const cotRow = z.object({
  cftc_contract_market_code: z.string(), market_and_exchange_names: z.string(),
  report_date_as_yyyy_mm_dd: z.string(), open_interest_all: z.string().regex(/^\d+$/),
  noncomm_positions_long_all: z.string().regex(/^\d+$/), noncomm_positions_short_all: z.string().regex(/^\d+$/),
});

export function parsePositioning(input: unknown, now = new Date()) {
  const rows = z.array(cotRow).parse(input);
  const selected = new Map(cotMarkets.map(([,, code]) => [code, new Map<string, {long:number;short:number;openInterest:number}>()]));
  for (const row of rows) {
    const history = selected.get(row.cftc_contract_market_code as typeof cotMarkets[number][2]);
    if (!history) continue;
    const date = row.report_date_as_yyyy_mm_dd;
    if (!/^20\d\d-\d\d-\d\dT00:00:00(?:\.\d{3})?$/.test(date) || !Number.isFinite(Date.parse(date+'Z')) || new Date(date+'Z').toISOString().slice(0,10) !== date.slice(0,10) || Date.parse(date+'Z') > now.getTime()) throw new Error('Invalid CFTC report date');
    const [openInterest, long, short] = [row.open_interest_all, row.noncomm_positions_long_all, row.noncomm_positions_short_all].map(Number);
    if (![openInterest,long,short].every(Number.isSafeInteger) || openInterest <= 0 || long > openInterest || short > openInterest || history.has(date.slice(0,10))) throw new Error('Invalid CFTC position');
    history.set(date.slice(0,10), {long,short,openInterest});
  }
  const periods = [...new Set([...selected.values()].flatMap(history => [...history.keys()]))].sort();
  if (periods.length < 2 || periods.some((p,i) => i && (Date.parse(p)-Date.parse(periods[i-1])) % (7*86400000) !== 0)) throw new Error('Insufficient CFTC weekly history');
  const markets = cotMarkets.map(([id,name,code]) => {
    const history = selected.get(code)!;
    return {id,name,contract:code,positions:periods.map(p => history.get(p) ?? null),values:periods.map(p => {
      const point = history.get(p);
      return point ? (point.long-point.short)/point.openInterest*100 : null;
    })};
  }).filter(m => m.values.at(-1) !== null && m.values.at(-2) !== null);
  if (markets.length < 4) throw new Error('Insufficient CFTC market coverage');
  return {source:cotSource,sourceName:'CFTC',measure:'noncommercial-net-open-interest-percent',periods,markets,retrievedAt:now.toISOString()};
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
const krakenSchema = z.object({error:z.array(z.string()).length(0),result:z.record(z.string(),z.unknown())});
export function parseKrakenCandles(input:unknown, symbol:string, now=Date.now()) {
  const {result}=krakenSchema.parse(input);
  const rows=Object.entries(result).filter(([key])=>key!=='last');
  if(rows.length!==1 || !(symbol==='BTC-USD'?['XXBTZUSD','XBTUSD']:['XETHZUSD','ETHUSD']).includes(rows[0][0]))throw Error('Kraken market identity changed');
  const candles=z.array(z.tuple([z.number().int().positive(),z.string(),z.string(),z.string(),z.string(),z.string(),z.string(),z.number().int().nonnegative()])).min(8).parse(rows[0][1]);
  const history=candles.map(([time,open,high,low,close])=>{
    const values=[open,high,low,close].map(Number);
    if(time%86400!==0||time*1000>now||values.some(v=>!Number.isFinite(v)||v<=0)||values[2]>Math.min(values[0],values[3])||values[1]<Math.max(values[0],values[3]))throw Error('Invalid Kraken daily candle');
    return {date:new Date(time*1000).toISOString().slice(0,10),close:values[3],provisional:(time+86400)*1000>now};
  });
  if(history.some((row,i)=>i&&row.date<=history[i-1].date))throw Error('Kraken daily chronology changed');
  return {history:history.slice(-32),source:`https://www.kraken.com/prices/${symbol==='BTC-USD'?'bitcoin':'ethereum'}`,sourceName:'Kraken Spot',observedAt:null,timezone:'UTC'};
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

export const sentimentQuerySchema = z.object({dataset:z.enum(['positioning','daily','specialists','crypto-breakdown'])}).strict();
const sentimentNotes = {
  positioning:'CFTC weekly non-commercial futures net positions (long minus short) as a percentage of open interest for eight named contracts. Changes are percentage points, not USD fund flows, purchases, or transfers between markets. Tuesday observations are normally released Friday; each contract is a narrow market proxy.',
  daily:'Reference ETF and Coinbase or fallback Kraken Spot BTC/ETH close-price returns, not fund flows or dividend-adjusted total returns. sourceTier identifies primary, alternate, or saved data; preserve sourceName and observation dates. days covers seven UTC calendar dates; ETF dates use exchange timezone. Missing dates stay null; provisional bars are unfinished. change and change7 are percentages.',
  specialists:'Gold: actual global physically backed ETF net flows in USD at the reported cadence. crypto: change in native USD-pegged stablecoin supply, not BTC/ETH flows or proven new money. fear: daily Bitcoin Fear & Greed index 0–100, not fund flows. Per-feed errors mean unavailable.',
  'crypto-breakdown':'CoinGecko top-100 coverage excluding classified stablecoins; BTC, ETH and remaining altcoins. cap/delta/gain/loss are USD market capitalization, not cash flows; change is percent over rolling 24h. Contribution to rising value uses positive delta/gain; to falling value uses absolute negative delta/loss. Neither is trading volume or proof of money entering/leaving crypto.',
};

export function positioningRefreshMs(now = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-US', {timeZone:'America/New_York',weekday:'short',hour:'numeric',hourCycle:'h23'}).formatToParts(now);
  const day=parts.find(p=>p.type==='weekday')!.value,hour=Number(parts.find(p=>p.type==='hour')!.value);
  return day==='Fri'&&hour>=15 || day==='Sat'&&hour<4 ? 3600000 : 86400000;
}

export function registerSentiment(app: FastifyInstance, db?: Pool, background = false) {
  async function saveSnapshot(key: string, observedAt: string, payload: unknown) {
    if (!db) return;
    try {
      await db.query('INSERT INTO sentiment_snapshots(key,observed_at,payload) VALUES($1,$2,$3) ON CONFLICT(key) DO UPDATE SET observed_at=EXCLUDED.observed_at,payload=EXCLUDED.payload,saved_at=now() WHERE sentiment_snapshots.observed_at<=EXCLUDED.observed_at', [key, observedAt, payload]);
    } catch (error) { app.log.warn({err:error,key},'Sentiment snapshot save failed'); }
  }
  async function loadSnapshot<T>(key: string, maxAgeMs: number): Promise<T | undefined> {
    if (!db) return;
    try {
      const {rows}=await db.query('SELECT payload,observed_at FROM sentiment_snapshots WHERE key=$1', [key]);
      const row=rows[0];
      if (row && Date.now()-new Date(row.observed_at).getTime()<=maxAgeMs && new Date(row.observed_at).getTime()<=Date.now()+60000) return row.payload as T;
    } catch (error) { app.log.warn({err:error,key},'Sentiment snapshot read failed'); }
  }
  let cryptoData:ReturnType<typeof parseCryptoBreakdown>|undefined,cryptoChecked=0,cryptoFailed=false,cryptoPending:Promise<void>|undefined;
  async function readCrypto(){
    cryptoData??=await loadSnapshot<ReturnType<typeof parseCryptoBreakdown>>('crypto-breakdown',36*3600000);
    if(Date.now()-cryptoChecked>=3600000){
      cryptoPending??=(async()=>{
        try{
          const base='https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&page=1&sparkline=false';
          const [markets,stable]=await Promise.all([getHtml(base+'&per_page=100','application/json'),getHtml(base+'&category=stablecoins&per_page=250','application/json')]);
          const next=parseCryptoBreakdown(JSON.parse(markets),JSON.parse(stable));
          if(cryptoData && next.observedAt<cryptoData.observedAt)throw Error('Crypto observation regressed');
          cryptoData=next;cryptoFailed=false;
          await saveSnapshot('crypto-breakdown',cryptoData.observedAt,cryptoData);
        }catch(error){cryptoFailed=true;app.log.warn({err:error},'Crypto breakdown source unavailable');}
        finally{cryptoChecked=Date.now();cryptoPending=undefined;}
      })();
    }
    await cryptoPending;
    cryptoData??=await loadSnapshot<ReturnType<typeof parseCryptoBreakdown>>('crypto-breakdown',36*3600000);
    if(!cryptoData || Date.now()-Date.parse(cryptoData.observedAt)>36*3600000)return {error:'ยังอ่านองค์ประกอบคริปโตไม่ได้'};
    return {...cryptoData,stale:cryptoFailed,checkedAt:new Date(cryptoChecked).toISOString()};
  }
  type DailyData = ReturnType<typeof parseDailyQuotes> | ReturnType<typeof parseCryptoCandles> | ReturnType<typeof parseKrakenCandles>;
  const dailyCache = new Map<string,{data?:DailyData;checked:number;failed?:boolean;pending?:Promise<void>}>();
  async function readDaily(){
    const markets = await Promise.all(dailyMarkets.map(async market=>{
      let entry=dailyCache.get(market.id);
      if(!entry){entry={checked:0};dailyCache.set(market.id,entry);}
      const current=entry,crypto=market.category==='crypto';
      current.data??=await loadSnapshot<DailyData>('daily:'+market.id,(crypto?2:5)*86400000);
      if(Date.now()-current.checked>=3600000){
        current.pending??=(async()=>{
          try{
            const url=crypto?`https://api.exchange.coinbase.com/products/${market.symbol}/candles?granularity=86400`:`https://query1.finance.yahoo.com/v8/finance/chart/${market.symbol}?range=1mo&interval=1d`;
            let next:DailyData;
            try {
              const raw=JSON.parse(await getHtml(url,'application/json'));
              next=crypto?parseCryptoCandles(raw,market.symbol):parseDailyQuotes(raw,market.symbol);
            } catch(error) {
              if(!crypto)throw error;
              const pair=market.id==='btc'?'XBTUSD':'ETHUSD';
              next=parseKrakenCandles(JSON.parse(await getHtml(`https://api.kraken.com/0/public/OHLC?pair=${pair}&interval=1440`,'application/json')),market.symbol);
            }
            if(current.data && next.history.at(-1)!.date<current.data.history.at(-1)!.date)throw Error('Daily observation regressed');
            current.data=next;
            current.failed=false;
            await saveSnapshot('daily:'+market.id,current.data.history.at(-1)!.date,current.data);
          }catch(error){current.failed=true;app.log.warn({err:error,symbol:market.symbol},'Daily market source unavailable');}
          finally{current.checked=Date.now();current.pending=undefined;}
        })();
      }
      await current.pending;
      current.data??=await loadSnapshot<DailyData>('daily:'+market.id,(crypto?2:5)*86400000);
      if(current.data && Date.now()-Date.parse(current.data.history.at(-1)!.date)>(crypto?2:5)*86400000)current.data=undefined;
      return {...market,...current.data,...(current.data?dailyWindow(current.data.history):{}),stale:!!current.failed,sourceTier:current.failed?'saved':current.data?.sourceName==='Kraken Spot'?'alternate':'primary',checkedAt:new Date(current.checked).toISOString(),...(!current.data?{error:'ยังอ่านราคาต้นทางไม่ได้'}:{})};
    }));
    return {markets,retrievedAt:new Date().toISOString()};
  }
  const feeds = [
    { id: 'gold', source: goldSource, url: goldApi, parse: parseGold, ttl: 86400000 },
    { id: 'crypto', source: cryptoSource, url: 'https://stablecoins.llama.fi/stablecoincharts/all', parse: parseStablecoins, ttl: 6*3600000 },
    { id: 'fear', source: fearSource, url: 'https://api.alternative.me/fng/?limit=1', parse: parseFear, ttl: 6*3600000 },
  ];
  type Specialist = ReturnType<typeof parseGold> | ReturnType<typeof parseStablecoins> | ReturnType<typeof parseFear>;
  const specialistDate=(data:Specialist)=>'period' in data?data.period:data.history.at(-1)!.period;
  const specialistCache = new Map<string, { data?: Specialist; checked: number; failed?: boolean; pending?: Promise<void> }>();
  async function readSpecialists(){
    const results = await Promise.all(feeds.map(async feed => {
      let entry = specialistCache.get(feed.id);
      if (!entry) { entry = { checked: 0 }; specialistCache.set(feed.id, entry); }
      const current = entry;
      current.data??=await loadSnapshot<Specialist>('specialist:'+feed.id,feed.id==='gold'?60*86400000:2*86400000);
      if (Date.now() - current.checked >= (current.failed ? 3600000 : feed.ttl)) {
        current.pending ??= (async () => {
          try { const next=feed.parse(JSON.parse(await getHtml(feed.url, 'application/json')));
            if(current.data && specialistDate(next)<specialistDate(current.data))throw Error('Specialist observation regressed');
            current.data=next;current.failed=false;
            await saveSnapshot('specialist:'+feed.id,specialistDate(next),next);
          }
          catch (error) { current.failed = true; app.log.warn({ err: error, feed: feed.id }, 'Sentiment source unavailable'); }
          finally { current.checked = Date.now(); current.pending = undefined; }
        })();
      }
      await current.pending;
      const maxAge=feed.id==='gold'?60*86400000:2*86400000;
      current.data??=await loadSnapshot<Specialist>('specialist:'+feed.id,maxAge);
      if(current.data && Date.now()-Date.parse(specialistDate(current.data))>maxAge)current.data=undefined;
      return [feed.id, current.data ? { ...current.data, stale: !!current.failed, checkedAt: new Date(current.checked).toISOString() } : { id: feed.id, source: feed.source, error: 'อ่านข้อมูลต้นทางไม่สำเร็จ กรุณาลองอีกครั้ง' }];
    }));
    return Object.fromEntries(results);
  }
  let cotData: ReturnType<typeof parsePositioning> | undefined, cotChecked = 0, cotFailed = false, cotPending: Promise<void> | undefined;
  async function readPositioning() {
    cotData??=await loadSnapshot<ReturnType<typeof parsePositioning>>('positioning',21*86400000);
    if (Date.now() - cotChecked >= (cotFailed ? 3600000 : positioningRefreshMs())) {
      cotPending ??= (async () => {
        try {
          const since = new Date(Date.now() - 12 * 7 * 86400000).toISOString().slice(0,10);
          const url = new URL(cotApi);
          url.searchParams.set('$where', `cftc_contract_market_code in (${cotMarkets.map(([, , code]) => `'${code}'`).join(',')}) and report_date_as_yyyy_mm_dd >= '${since}T00:00:00'`);
          url.searchParams.set('$order', 'report_date_as_yyyy_mm_dd DESC');
          url.searchParams.set('$limit', '200');
          const next=parsePositioning(JSON.parse(await getHtml(url.href, 'application/json')));
          if(cotData && next.periods.at(-1)!<cotData.periods.at(-1)!)throw Error('CFTC observation regressed');
          cotData=next;
          cotFailed = false;
          await saveSnapshot('positioning',cotData.periods.at(-1)!,cotData);
        } catch (error) {
          cotFailed = true;
          console.warn('Sentiment source refresh failed', 'CFTC', error instanceof Error ? error.message.slice(0, 500) : 'Unknown error');
        } finally { cotChecked = Date.now(); cotPending = undefined; }
      })();
    }
    await cotPending;
    cotData??=await loadSnapshot<ReturnType<typeof parsePositioning>>('positioning',21*86400000);
    if (!cotData || Date.now()-Date.parse(cotData.periods.at(-1)!)>21*86400000) return { source: cotSource, error: 'ยังอ่านข้อมูล CFTC ไม่ได้' };
    return { ...cotData, stale: cotFailed, checkedAt: new Date(cotChecked).toISOString() };
  }
  if (background) {
    let timer: ReturnType<typeof setInterval> | undefined, pending: Promise<void> | undefined, stopping=false;
    // ponytail: one scheduler per API process; use a shared job queue before adding API replicas.
    function refresh() {
      if(stopping || pending)return;
      pending=Promise.allSettled([readDaily(),readCrypto(),readSpecialists(),readPositioning()])
        .then(results=>{for(const result of results)if(result.status==='rejected')app.log.error({err:result.reason},'Background sentiment refresh failed');})
        .finally(()=>{pending=undefined;});
    }
    app.addHook('onReady',async()=>{
      refresh();timer=setInterval(refresh,60000);timer.unref();
    });
    app.addHook('onClose',async()=>{
      stopping=true;clearInterval(timer);await pending;
    });
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
  app.get('/api/v1/sentiment/positioning',async(_req,reply)=>{
    reply.header('Cache-Control','private, no-store');
    const data=await readPositioning();
    if ('error' in data) reply.code(503);
    return data;
  });
  return async function readSentiment(input:unknown){
    const {dataset}=sentimentQuerySchema.parse(input);
    const readers={positioning:readPositioning,daily:readDaily,specialists:readSpecialists,'crypto-breakdown':readCrypto};
    return {dataset,data:await readers[dataset](),interpretation:sentimentNotes[dataset],freshness:'Shared cached data: stale:false does not mean fetched live for this request; it only means the last refresh did not fail. stale:true means retained data after refresh failure, including durable snapshots. Daily sourceTier=alternate uses Kraken Spot, not Coinbase; sourceTier=saved uses a prior observation. checkedAt is the last refresh attempt, not the observation date or proof of a successful download. retrievedAt is retrieval time; use source periods/observedAt for observation freshness. Never describe a cached result as just fetched or real-time.'};
  };
}
