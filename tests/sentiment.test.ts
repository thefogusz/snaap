import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { parseFlows, parseGold, parseStablecoins, parseFear, parseDailyQuotes, parseCryptoCandles, dailyWindow, parseCryptoBreakdown, registerSentiment } from '../src/sentiment.js';

test('ICI flows: units, chronology, missing values, cache failures and no double counting', async (t) => {
  const table = (rows: (string | number)[][]) => '<table>' + rows.map(r => '<tr>' + r.map(c => `<td>${c}</td>`).join('') + '</tr>').join('') + '</table>';
  const heading = '<h1>Report</h1><time datetime="2026-09-22T17:12:37Z"></time>';
  const global = heading + 'Billions of US dollars' + table([['Assets', 95000]]) + table([
    ['', 2025, 2026], ['Q4', 'Q1', 'Q2'], ['All funds*', 25, 25, 25], ['Equity', -10, 10, 10], ['Bond', 20, 10, 10], ['Balanced/Mixed', 5, 1, 1], ['Money market', 10, 1, 1], ['Real Estate', '*', 1, 1], ['Other', 0, 1, 1], ['Guaranteed', 0, 1, 1], ['ETFs', 999, 999, 999],
  ]) + 'Net sales are new sales plus reinvested dividends less redemptions plus net exchanges.';
  const parsed = parseFlows(global, 'global', 'https://www.ici.org/statistical-report/ww_q2_26');
  assert.deepEqual(parsed.periods, ['2025 Q4', '2026 Q1', '2026 Q2']);
  assert.equal(parsed.markets[0].values[0], -10e9);
  assert.equal(parsed.markets.find(m => m.id === 'property')!.values[0], null);
  assert.equal(parsed.total[2], 25e9);
  assert.throws(() => parseFlows(global.replace('Net sales are new sales', 'Net assets'), 'global', parsed.source));
  assert.throws(() => parseFlows(global.replace('<td>25</td>', '<td>95000</td>'), 'global', parsed.source));
  assert.throws(() => parseFlows(global, 'global', parsed.source.replace('q2', 'q3')));
  assert.throws(() => parseFlows(global.replace('2026-09-22T17:12:37Z','2099-09-22T17:12:37Z'), 'global', parsed.source));
  assert.throws(() => parseFlows(global, 'global', parsed.source, new Date('2026-03-01')));
  assert.throws(() => parseFlows(global.replace('2026-09-22T17:12:37Z','2026-03-01T17:12:37Z'), 'global', parsed.source));
  const weekly = heading.replace('2026-09-22','2026-10-07') + 'Estimated Fund Flows<br>Millions of dollars' + table([
    ['', '9/30/2026', '9/23/2026'], ['Equity', -4, 10], ['Domestic', 999, 999], ['Bond', 2, 2], ['Hybrid', -1, 1], ['Commodity', -1, 1], ['Total', -4, 14],
  ]);
  const us = parseFlows(weekly, 'us', 'https://www.ici.org/research/stats/combined_flows');
  assert.deepEqual(us.periods, ['2026-09-23', '2026-09-30']);
  assert.deepEqual(us.markets[0].values, [10e6, -4e6]);
  assert.equal(us.markets.length, 4);
  assert.throws(() => parseFlows(weekly.replace('9/30/2026', '2/30/2026'), 'us', us.source));
  assert.throws(() => parseFlows(weekly.replace('Millions of dollars', 'Billions of dollars'), 'us', us.source));
  assert.throws(() => parseFlows(weekly.replace('<td>-4</td>', '<td>N/A</td>'), 'us', us.source));
  assert.throws(() => parseFlows(weekly.replace('<td>-4</td>', '<td>*</td>'), 'us', us.source));

  let calls = 0, unavailable = false, now = Date.now();
  const warnings = t.mock.method(console, 'warn', () => {});
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    if (unavailable) throw new Error('offline');
    return new Response(weekly, { headers: { 'content-type': 'text/html' } });
  });
  const app = Fastify(); const readSentiment = registerSentiment(app); t.after(() => app.close());
  await assert.rejects(async () => readSentiment({dataset:'http://localhost/secret'}));
  await assert.rejects(async () => readSentiment({dataset:'us-flows',url:'https://example.com'}));
  assert.equal((await app.inject('/api/v1/sentiment?universe=bad')).statusCode, 400);
  assert.equal(calls, 0);
  const [first, concurrent, evidence] = await Promise.all([app.inject('/api/v1/sentiment?universe=us'), app.inject('/api/v1/sentiment?universe=us'), readSentiment({dataset:'us-flows'})]);
  assert.deepEqual(evidence.data, first.json());
  assert.equal(evidence.dataset, 'us-flows');
  assert.equal(first.statusCode, 200); assert.equal(concurrent.statusCode, 200); assert.equal(calls, 1);
  assert.equal(first.json().stale, false);
  unavailable = true; now += 7 * 3600000;
  const stale = await app.inject('/api/v1/sentiment?universe=us');
  assert.deepEqual((await readSentiment({dataset:'us-flows'})).data, stale.json());
  assert.equal(stale.statusCode, 200); assert.equal(stale.json().stale, true);
  assert.deepEqual(stale.json().total, first.json().total);
  await app.inject('/api/v1/sentiment?universe=us'); assert.equal(calls, 2);
  const empty = Fastify(); registerSentiment(empty); t.after(() => empty.close());
  const backup = await empty.inject('/api/v1/sentiment?universe=us');
  assert.equal(backup.statusCode, 200);
  assert.equal(backup.json().stale, true);
  assert.equal(backup.json().total.at(-1), -1969e6);
  assert.equal(backup.json().periods.at(-1), '2026-09-30');
  assert.ok(Date.parse(backup.json().retrievedAt) < now);
  assert.deepEqual(warnings.mock.calls.at(-1)!.arguments, ['Sentiment source refresh failed', 'us', 'offline']);
  t.mock.method(globalThis, 'fetch', async () => new Response('unavailable', {status: 503}));
  now += 60001;
  await empty.inject('/api/v1/sentiment?universe=us');
  assert.deepEqual(warnings.mock.calls.at(-1)!.arguments, ['Sentiment source refresh failed', 'us', 'Source HTTP 503 (www.ici.org)']);
  const worldwide = (await empty.inject('/api/v1/sentiment?universe=global')).json();
  assert.equal(worldwide.stale, true);
  assert.equal(worldwide.total.at(-1), 1034e9);
  assert.equal(worldwide.periods.at(-1), '2026 Q2');
  unavailable = false;
  t.mock.method(globalThis, 'fetch', async () => new Response(weekly, {headers: {'content-type': 'text/html'}}));
  now += 60001;
  const recovered = (await empty.inject('/api/v1/sentiment?universe=us')).json();
  assert.equal(recovered.stale, false);
  assert.deepEqual(recovered.total, us.total);
});


test('Specialists: actual flows vs supply vs index, aligned dates, partial failure and cache', async t => {
  const dates = ['2026-04-30','2026-05-31','2026-06-30','2026-07-31','2026-08-31','2026-09-30'];
  const series = ['North America','Europe','Asia','Other'].map((name,i) => ({name,type:'column',yAxis:0,data:dates.map(d=>[Date.parse(d),(i-1)*1e6])}));
  series.push({name:'Gold Price (rhs)',type:'line',yAxis:1,data:dates.map(d=>[Date.parse(d),9999999])});
  const gold = {chartData:{asOfDate:'2026-09-30',data:{Monthly:{series:{usd:series}}}}};
  assert.equal(parseGold(gold).history.at(-1)!.value,2e6); // exclude price line
  const changed = structuredClone(gold); changed.chartData.data.Monthly.series.usd[0].data[5][0]-=86400000;
  assert.throws(()=>parseGold(changed));
  assert.throws(()=>parseGold({...gold,chartData:{...gold.chartData,asOfDate:'2026-10-01'}}));
  const weekly = structuredClone(gold.chartData.data.Monthly);
  weekly.series.usd.forEach(s=>s.data.forEach((d,i)=>d[0]=Date.parse('2026-09-01')+i*7*86400000));
  assert.equal(parseGold({chartData:{...gold.chartData,data:{...gold.chartData.data,Weekly:weekly}}}).cadence,'weekly');
  const stable = Array.from({length:8},(_,i)=>({date:String(Date.parse('2026-09-30')/1000+i*86400),totalCirculating:{peggedUSD:1000+i*10},totalCirculatingUSD:{peggedUSD:9999999-i*100}}));
  assert.equal(parseStablecoins(stable).history.at(-1)!.value,10); // not the price-valued market cap
  assert.equal(parseStablecoins(stable).supply,1070);
  const gap=structuredClone(stable);gap[5].date=gap[4].date;
  assert.throws(()=>parseStablecoins(gap));
  assert.throws(()=>parseStablecoins(stable.slice(1)));
  const fear={data:[{value:'64',value_classification:'Greed',timestamp:String(Date.parse('2026-10-07')/1000)}],metadata:{error:null}};
  assert.equal(parseFear(fear).value,64);
  assert.equal(parseFear(fear).classification,'Greed');
  assert.equal(parseFear({...fear,data:[{...fear.data[0],value:'47',value_classification:'Neutral'}]}).classification,'Neutral');
  assert.throws(()=>parseFear({...fear,data:[{...fear.data[0],value_classification:'Unknown'}]}));
  assert.throws(()=>parseFear({...fear,data:[{...fear.data[0],value:'101'}]}));
  assert.throws(()=>parseFear({...fear,metadata:{error:'bad'}}));
  let now=Date.now(),fail=false,calls=0;
  t.mock.method(Date,'now',()=>now);
  t.mock.method(globalThis,'fetch',async (url: string | URL | Request)=>{
    calls++;if(fail&&String(url).includes('gold.org'))throw Error('offline');
    const body=String(url).includes('gold.org')?gold:String(url).includes('llama.fi')?stable:fear;
    return new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}});
  });
  const app=Fastify();const readSentiment=registerSentiment(app);t.after(()=>app.close());
  const [first,other]=await Promise.all([app.inject('/api/v1/sentiment/specialists'),app.inject('/api/v1/sentiment/specialists')]);
  assert.equal(first.statusCode,200);assert.equal(other.statusCode,200);assert.equal(calls,3);
  assert.equal(first.json().crypto.stale,false);
  assert.deepEqual((await readSentiment({dataset:'specialists'})).data,first.json());
  assert.equal(calls,3);
  fail=true;now+=2*3600000;
  const stale=(await app.inject('/api/v1/sentiment/specialists')).json();
  assert.equal(stale.gold.stale,true);assert.equal(stale.crypto.stale,false);assert.equal(stale.fear.stale,false);
  assert.deepEqual(stale.gold.history,first.json().gold.history);
  const empty=Fastify();registerSentiment(empty);t.after(()=>empty.close());
  const partial=(await empty.inject('/api/v1/sentiment/specialists')).json();
  assert.ok(partial.gold.error);assert.equal(partial.crypto.supply,1070);
});

test('Daily markets: identity, calendar gaps, provisional candles, returns and isolated stale cache', async t => {
  let now = Date.parse('2026-10-08T12:00:00Z');
  t.mock.method(Date, 'now', () => now);
  const dates = ['2026-09-24','2026-09-25','2026-09-28','2026-09-29','2026-09-30','2026-10-01','2026-10-02','2026-10-05','2026-10-06','2026-10-07'];
  const quote = (symbol='SPY') => ({chart:{error:null,result:[{meta:{symbol,currency:'USD',exchangeTimezoneName:'America/New_York',regularMarketTime:Date.parse('2026-10-07T20:00:00Z')/1000},timestamp:dates.map(d=>Date.parse(d+'T13:30:00Z')/1000),indicators:{quote:[{close:dates.map((_,i)=>95+i)}]}}]}});
  const parsed=parseDailyQuotes(quote(),'SPY',now);
  const window=dailyWindow(parsed.history,now);
  assert.equal(window.days.length,7);
  assert.equal(window.days[0].date,'2026-10-02');
  assert.equal(window.days[1].close,null); // Saturday is absent, never a fabricated 0% return.
  assert.equal(window.days[6].close,null); // US session has not opened yet.
  assert.equal(window.latest.date,'2026-10-07');
  assert.ok(Math.abs(window.change7!-4)<1e-9); // 104 versus Oct 1 close 100.
  assert.ok(Math.abs(window.days[3].change!-(102/101-1)*100)<1e-9);
  assert.throws(()=>parseDailyQuotes(quote(),'GLD',now));
  const duplicate=quote();duplicate.chart.result[0].timestamp[9]=duplicate.chart.result[0].timestamp[8];
  assert.throws(()=>parseDailyQuotes(duplicate,'SPY',now));
  const future=quote();future.chart.result[0].meta.regularMarketTime=now/1000+120;
  assert.throws(()=>parseDailyQuotes(future,'SPY',now));
  const missing=quote() as any;missing.chart.result[0].indicators.quote[0].close[9]=null;
  assert.equal(parseDailyQuotes(missing,'SPY',now).history.at(-1)!.date,'2026-10-06');
  const candles=Array.from({length:10},(_,i)=>[Date.parse('2026-09-29')/1000+i*86400,90,120,100,100+i,10]).reverse();
  const crypto=parseCryptoCandles(candles,'BTC-USD',now);
  assert.equal(crypto.history.at(-1)!.provisional,true);
  assert.equal(crypto.history.at(-2)!.provisional,false);
  assert.equal(dailyWindow(crypto.history,now).days.filter(d=>d.close!==null).length,7);
  assert.throws(()=>parseCryptoCandles([...candles,candles[0]],'BTC-USD',now));
  const invalid=structuredClone(candles);invalid[0][1]=200;
  assert.throws(()=>parseCryptoCandles(invalid,'BTC-USD',now));
  let calls=0,fail=false;
  t.mock.method(globalThis,'fetch',async (url:string|URL|Request)=>{
    calls++;const text=String(url);
    if(fail&&text.includes('/GLD?'))throw Error('offline');
    const body=text.includes('coinbase.com')?candles:quote(text.match(/chart\/([^?]+)/)![1]);
    return new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}});
  });
  const app=Fastify();const readSentiment=registerSentiment(app);t.after(()=>app.close());
  const [first,parallel]=await Promise.all([app.inject('/api/v1/sentiment/daily'),app.inject('/api/v1/sentiment/daily')]);
  assert.equal(first.statusCode,200);assert.equal(parallel.statusCode,200);assert.equal(calls,10);
  const evidence=await readSentiment({dataset:'daily'});
  assert.deepEqual((evidence.data as any).markets,first.json().markets);
  assert.equal(calls,10);
  assert.equal(first.json().markets.length,10);
  fail=true;now+=6*60000;
  const stale=(await app.inject('/api/v1/sentiment/daily')).json().markets;
  assert.equal(stale.find((m:any)=>m.id==='gld').stale,true);
  assert.equal(stale.find((m:any)=>m.id==='btc').stale,false);
  assert.deepEqual(stale.find((m:any)=>m.id==='gld').history,first.json().markets.find((m:any)=>m.id==='gld').history);
  const empty=Fastify();registerSentiment(empty);t.after(()=>empty.close());
  const partial=(await empty.inject('/api/v1/sentiment/daily')).json().markets;
  assert.ok(partial.find((m:any)=>m.id==='gld').error);
  assert.equal(partial.find((m:any)=>m.id==='spy').change7,window.change7);
});


test('Crypto hierarchy: cap-weighted changes, 80% contribution, stablecoin exclusion and stale cache', async t=>{
  let now=Date.parse('2026-10-08T08:00:00Z');t.mock.method(Date,'now',()=>now);
  const coin=(id:string,cap:number,delta:number)=>({id,name:id,symbol:id,market_cap:cap,market_cap_change_24h:delta,price_change_percentage_24h:1,last_updated:'2026-10-08T07:55:00Z'});
  const raw=[coin('bitcoin',110,10),coin('ethereum',180,80),coin('alt',110,10),coin('loser',90,-10),coin('stable',100000,50000)];
  const stables=[{id:'stable',market_cap:100000}];
  const parsed=parseCryptoBreakdown(raw,stables,now);
  assert.equal(parsed.cap,490);assert.equal(parsed.delta,90);assert.equal(parsed.change,22.5);
  assert.equal(parsed.gain,100);assert.equal(parsed.loss,10);assert.equal(parsed.count,4);
  assert.equal(parsed.groups.find(g=>g.id==='ethereum')!.gain/parsed.gain*100,80);
  assert.equal(parsed.groups.find(g=>g.id==='altcoins')!.delta,0);
  assert.equal(parsed.groups.reduce((sum,g)=>sum+g.cap,0),parsed.cap);
  assert.equal(parsed.groups.reduce((sum,g)=>sum+g.delta,0),parsed.delta);
  assert.throws(()=>parseCryptoBreakdown([...raw,raw[0]],stables,now));
  assert.throws(()=>parseCryptoBreakdown(raw.filter(r=>r.id!=='bitcoin'),stables,now));
  assert.throws(()=>parseCryptoBreakdown(raw,stables,now+7*3600000));
  assert.throws(()=>parseCryptoBreakdown(raw.map(r=>({...r,last_updated:'2026-10-09T08:00:00Z'})),stables,now));
  assert.throws(()=>parseCryptoBreakdown([coin('bitcoin',10,11),...raw.slice(1)],stables,now));
  assert.throws(()=>parseCryptoBreakdown(raw,Array.from({length:250},(_,i)=>({id:String(i),market_cap:1e9})),now));
  const falling=parseCryptoBreakdown(raw.map(r=>({...r,market_cap_change_24h:-Math.abs(r.market_cap_change_24h)})),stables,now);
  assert.equal(falling.gain,0);assert.equal(falling.loss,110);
  let calls=0,fail=false;
  t.mock.method(globalThis,'fetch',async(url:string|URL|Request)=>{
    calls++;if(fail)throw Error('offline');
    return new Response(JSON.stringify(String(url).includes('category=stablecoins')?stables:raw),{headers:{'content-type':'application/json'}});
  });
  const app=Fastify();const readSentiment=registerSentiment(app);t.after(()=>app.close());
  const [first,other]=await Promise.all([app.inject('/api/v1/sentiment/crypto-breakdown'),app.inject('/api/v1/sentiment/crypto-breakdown')]);
  assert.equal(first.statusCode,200);assert.equal(other.statusCode,200);assert.equal(calls,2);
  assert.deepEqual((await readSentiment({dataset:'crypto-breakdown'})).data,first.json());
  assert.equal(calls,2);
  now+=16*60000;fail=true;
  const stale=await app.inject('/api/v1/sentiment/crypto-breakdown');assert.equal(stale.json().stale,true);assert.equal(stale.json().cap,490);
  const empty=Fastify();registerSentiment(empty);t.after(()=>empty.close());assert.equal((await empty.inject('/api/v1/sentiment/crypto-breakdown')).statusCode,503);
});

test('Sentiment reader preserves cold-start fallback and per-source errors without invented values',async t=>{
  t.mock.method(console,'warn',()=>{});
  let calls=0;
  t.mock.method(globalThis,'fetch',async()=>{calls++;throw Error('offline');});
  const app=Fastify(),readSentiment=registerSentiment(app);t.after(()=>app.close());
  for(const dataset of ['us-flows','global-flows','daily','specialists','crypto-breakdown']){
    const evidence=await readSentiment({dataset});
    assert.equal(evidence.dataset,dataset);assert.ok(evidence.interpretation.length);
    const data=evidence.data as any;
    if(dataset.endsWith('-flows')){
      assert.equal(data.stale,true);assert.ok(data.source.startsWith('https://www.ici.org/'));
      assert.ok(data.publishedAt);assert.ok(data.retrievedAt);assert.ok(data.checkedAt);
    }else if(dataset==='daily')assert.ok(data.markets.every((m:any)=>m.error&&m.stale&&!m.history));
    else if(dataset==='specialists')assert.ok(Object.values(data).every((m:any)=>m.error&&m.source));
    else assert.ok(data.error);
  }
  const before=calls;
  await assert.rejects(()=>readSentiment({dataset:'us-flows',url:'http://localhost'}));
  await assert.rejects(()=>readSentiment({dataset:'unknown'}));
  assert.equal(calls,before);
});
