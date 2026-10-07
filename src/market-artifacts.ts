import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { candles, instruments, marketTickers } from './markets.js';
import { analysisQuerySchema } from './market-research.js';
import { timeframe } from './domain/engine.js';
import { freshness } from './domain/insights.js';
import { lastClosedBoundary } from '../dist/timeframes.js';

export const visualQuerySchema = z.object({
  kind:z.enum(['comparison','history']), market:z.enum(['Spot','Perpetual Futures']),
  targets:analysisQuerySchema.shape.targets.max(5), timeframe:timeframe.nullable(), bars:z.number().int().min(20).max(300),
}).strict();
export async function readMarketVisual(raw:unknown, reads = {instruments, candles, marketTickers}) {
  const q=visualQuerySchema.parse(raw);
  if(q.kind==='history' && (!q.timeframe || q.targets.length>3)) throw new Error('History needs a timeframe and at most three targets');
  const targets=[...new Map(q.targets.map(t=>[t.exchange+':'+t.pair,t])).values()];
  const results=await Promise.allSettled(targets.map(async target=>{
    const catalog=await reads.instruments(target.exchange,q.market);
    if(!catalog.items.some(item=>item.symbol===target.pair && item.supported)) throw new Error('Unsupported instrument');
    if(q.kind==='comparison') {
      const snapshot=await reads.marketTickers(target.exchange,q.market), item=snapshot.items.find(item=>item.pair===target.pair);
      if(!item) throw new Error('Ticker unavailable');
      return {...target,...item,status:item.providerTime===null?'SOURCE_TIME_UNKNOWN':'OBSERVED',fetchedAt:snapshot.fetchedAt};
    }
    const now=Date.now(), rows=(await reads.candles(target.exchange,q.market,target.pair,q.timeframe!,q.bars)).filter(row=>row.time<=lastClosedBoundary(now,q.timeframe!)).slice(-q.bars);
    const state=freshness(q.timeframe!,rows,now);
    return {...target,...state,bars:rows.length,historyCoverage:state.status==='INSUFFICIENT'?'INVALID':rows.length<q.bars?'PARTIAL':'COMPLETE',points:state.status==='INSUFFICIENT'?[]:rows.map(row=>({time:row.time,close:row.close}))};
  }));
  return {market:q.market,timeframe:q.timeframe,requestedBars:q.kind==='history'?q.bars:null,asOf:new Date().toISOString(),
    scope:q.kind==='history'?'Closed-candle prices for exact venue/products. Multiple histories are indexed to 100 at their first common timestamp; not total returns or a forecast. Missing/invalid history is excluded.':'Separate native products and venue prices, not consolidated prices. Rolling 24h turnover uses each pair’s quote currency. Retrieval time does not prove source freshness.',
    items:results.map((result,i)=>result.status==='fulfilled'?result.value:{...targets[i],status:'UNAVAILABLE'}),
  };
}

const titles:Record<string,string>={screen_assets:'อันดับตลาด',analyze_assets:'ภาพรวมอินดิเคเตอร์',read_market_news:'ข่าวจากต้นทาง',read_chain_activity:'ธุรกรรม Bitcoin',read_dex_pools:'เปรียบเทียบพูล DEX',read_defi_context:'ภาพรวม TVL',read_evm_transfers:'ธุรกรรมบนเชน',read_market_visual:'เปรียบเทียบราคา'};
// Public reader snapshots only: never accept HTML, scripts, or a model-generated chart configuration.
export type MarketArtifact={version:1;id:string;kind:string;title:string;tool:string;query:unknown;createdAt:string;data:Record<string,any>};
export function marketArtifact(tool:string,query:unknown,result:unknown):MarketArtifact|null {
  if(!titles[tool] || !result || typeof result!=='object' || 'error' in result) return null;
  const data=result as Record<string,any>;
  if(!Array.isArray(data.items) || data.items.length>20 || Buffer.byteLength(JSON.stringify(data))>256000) return null;
  const kind=tool==='read_market_visual'?(query as z.infer<typeof visualQuerySchema>).kind:tool;
  const sortTitles:Record<string,string>={volume:'วอลุ่มซื้อขายสูงสุด',gainers:'ราคาขึ้นแรง',losers:'ราคาลงแรง',new:'คู่เทรดที่เพิ่มใหม่',liquidity:'สภาพคล่องสูงสุด'};
  const title=kind==='history'?'กราฟราคาย้อนหลัง':tool==='screen_assets'?sortTitles[(query as {sort:string}).sort]??titles[tool]:tool==='read_dex_pools'?'พูล DEX · '+sortTitles[(query as {sort:string}).sort]:titles[tool];
  return {version:1,id:randomUUID(),kind,title,tool,query,createdAt:new Date().toISOString(),data};
}
export function artifactReceipt(artifact:MarketArtifact) {
  const {items,...context}=artifact.data;
  return {...context,artifactId:artifact.id,displayed:true,itemCount:items.length,
    // Keep selected comparison/analysis metrics useful for follow-up reasoning, never historical series.
    items:items.map((item:Record<string,any>)=>Object.fromEntries([
      'pair','exchange','name','title','publishedAt','updatedAt','dateBasis','chain','baseToken','quoteToken','pairAddress','contractAddress','txid','url','status','trend','signalSupported','latestClose','bars','historyCoverage',
      ...(artifact.kind==='comparison'?['last','quoteVolume','changePercent']:artifact.kind==='analyze_assets'?['metrics']:[]),
    ].filter(key=>key in item).map(key=>[key,item[key]]))),
    modelRowsAbbreviated:true,omissionMeaning:'Model context only; original values are displayed in the artifact. Do not claim missing source fields. Reply briefly without reproducing rows.',
  };
}
