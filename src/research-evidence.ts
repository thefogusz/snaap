import { z } from 'zod';

const hosts = ['nvidia.com','apple.com','microsoft.com','gate.com','api.gateio.ws','mempool.space'];
function allowedURL(value: string, base?: string) {
  const url = new URL(value, base);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !hosts.some(host => url.hostname === host || url.hostname.endsWith('.'+host))) throw new Error('Unsupported evidence URL');
  return url;
}
const cached = new Map<string,{at:number;text:string}>(), pending = new Map<string,Promise<string>>(), failed = new Map<string,number>();
export async function readPublicText(value: string, ttl: number) {
  const url = allowedURL(value).href, hit = cached.get(url);
  if (hit && Date.now()-hit.at < ttl) return hit.text;
  if (Date.now()-(failed.get(url)??0)<15000) throw new Error('Evidence source retry cooldown');
  if (pending.has(url)) return pending.get(url)!;
  const work = (async () => {
    const gate = url === 'https://api.gateio.ws/api/v4/ann/list_article';
    const response = await fetch(url, { signal:AbortSignal.timeout(12000), redirect:'error', ...(gate ? {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({page:'1',size:'50',language:'en'})} : {}) });
    if (!response.ok || !response.body) throw new Error('Evidence HTTP unavailable');
    const reader = response.body.getReader(), chunks:Uint8Array[]=[];
    let size = 0;
    try {
      for (;;) {const {done,value}=await reader.read(); if(done) break; size+=value.length; if(size>1_500_000) throw new Error('Evidence response too large'); chunks.push(value);}
    } finally {await reader.cancel().catch(()=>{});}
    const text = Buffer.concat(chunks).toString('utf8');
    // ponytail: bounded process-local evidence cache; share storage when deploying multiple API processes.
    if (cached.size>=64) cached.delete(cached.keys().next().value!);
    cached.set(url,{at:Date.now(),text}); failed.delete(url);
    return text;
  })();
  pending.set(url,work);
  try {return await work;} catch(error) {if(failed.size>=64) failed.delete(failed.keys().next().value!); failed.set(url,Date.now()); throw error;} finally {pending.delete(url);}
}
function plain(value: string) {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>{const code=parseInt(n[0].toLowerCase()==='x'?n.slice(1):n,n[0].toLowerCase()==='x'?16:10);return code>0&&code<=0x10ffff?String.fromCodePoint(code):'';})
    .replace(/&(?:amp|lt|gt|quot|apos);/g,s=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"})[s]!)
    .replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim();
}
const iso = (value:string) => {const at=Date.parse(plain(value));return Number.isFinite(at)?new Date(at).toISOString():null;};
const bangkok = (value:string|null) => value ? new Date(Date.parse(value)+7*3600000).toISOString().slice(0,19)+'+07:00' : null;
const field = (xml:string,name:string) => xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`,'i'))?.[1]??'';
type News = {symbol:string;title:string;url:string;publishedAt:string|null;updatedAt:string|null;dateBasis:'PUBLISHED'|'UPDATED'};
export function parseNewsFeed(xml:string,symbol:string,feed:string,now=Date.now()):News[] {
  if(xml.length>1_500_000 || /<!DOCTYPE|<!ENTITY/i.test(xml) || !/<(?:rss|feed)\b/i.test(xml)) throw new Error('Unsupported publisher feed');
  const root = new URL(feed).hostname.split('.').slice(-2).join('.'), rows:News[]=[];
  // Fixed publisher RSS/Atom feeds only; no arbitrary XML or article fetching.
  for(const match of xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    if(rows.length>=50) break;
    const block=match[2], title=plain(field(block,'title')).slice(0,300);
    const publishedAt=iso(field(block,'pubDate')||field(block,'published')),updatedAt=iso(field(block,'updated'));
    const at=Date.parse(publishedAt??updatedAt??'');
    if(!title||!Number.isFinite(at)||at>now+5000) continue;
    const atomLink=[...block.matchAll(/<link\b([^>]*)\/?\s*>/gi)].find(m=>!/\brel\s*=\s*["'](?:self|enclosure)["']/i.test(m[1])&&/\bhref\s*=/i.test(m[1]));
    const link=atomLink?.[1].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1]??field(block,'link');
    if(!plain(link)) continue;
    try {const url=allowedURL(plain(link),feed);if(url.hostname!==root&&!url.hostname.endsWith('.'+root)) continue; rows.push({symbol,title,url:url.href,publishedAt,updatedAt,dateBasis:publishedAt?'PUBLISHED':'UPDATED'});} catch { /* Invalid links are not evidence. */ }
  }
  return rows;
}
export const newsQuerySchema=z.object({topic:z.enum(['stocks','crypto','all']),symbols:z.array(z.string().regex(/^[A-Z0-9]{1,10}$/)).max(5),hours:z.number().int().min(1).max(720),limit:z.number().int().min(1).max(20),query:z.string().max(80)}).strict();
const feeds=[
  {symbol:'NVDA',name:'NVIDIA Newsroom',topic:'stocks',url:'https://nvidianews.nvidia.com/releases.xml'},
  {symbol:'AAPL',name:'Apple Newsroom',topic:'stocks',url:'https://www.apple.com/newsroom/rss-feed.rss'},
  {symbol:'MSFT',name:'Microsoft Blog',topic:'stocks',url:'https://blogs.microsoft.com/feed/'},
  {symbol:'',name:'Gate Announcements',topic:'crypto',url:'https://api.gateio.ws/api/v4/ann/list_article'},
];
const announcements=z.object({code:z.literal(0),data:z.object({list:z.array(z.object({title:z.string().max(2000),url:z.string().max(2000),release_timestamp:z.string().regex(/^\d{1,12}$/)})).max(100)})});
export async function readMarketNews(raw:unknown,read=readPublicText) {
  const q=newsQuerySchema.parse(raw), now=Date.now(),cutoff=now-q.hours*3600000;
  const selected=feeds.filter(f=>(q.topic==='all'||f.topic===q.topic)&&(!q.symbols.length||q.symbols.includes(f.symbol)));
  const results=await Promise.allSettled(selected.map(async f=>{
    const text=await read(f.url,300000);
    if(f.topic==='stocks') return parseNewsFeed(text,f.symbol,f.url,now);
    return announcements.parse(JSON.parse(text)).data.list.flatMap(a=>{
      const time=Number(a.release_timestamp)*1000;
      try {const url=allowedURL(a.url,'https://www.gate.com'); if(url.hostname!=='www.gate.com'||!url.pathname.startsWith('/announcements/article/')) return []; return [{symbol:'',title:plain(a.title).slice(0,300),url:url.href,publishedAt:new Date(time).toISOString(),updatedAt:null,dateBasis:'PUBLISHED' as const}];} catch {return [];}
    });
  }));
  const items=results.flatMap(r=>r.status==='fulfilled'?r.value:[]).filter(a=>{const t=Date.parse(a.publishedAt??a.updatedAt!);return t>=cutoff&&t<=now+5000&&a.title.toLowerCase().includes(q.query.toLowerCase());});
  if(selected.length&&results.every(r=>r.status==='rejected')) throw new Error('All selected news sources unavailable');
  return {asOf:new Date(now).toISOString(),windowHours:q.hours,sources:[...results.map((r,i)=>({name:selected[i].name,symbol:selected[i].symbol,status:r.status==='fulfilled'?'READY':'UNAVAILABLE',feed:selected[i].url})),...q.symbols.filter(s=>!feeds.some(f=>f.symbol===s)).map(symbol=>({symbol,status:'UNSUPPORTED'}))],
    scope:'Publisher feed titles only, not full articles or the complete news market. UPDATED means publication time was not supplied. Importance and price implications are interpretation. Empty results do not prove no news.',
    items:[...new Map(items.map(a=>[a.url,a])).values()].sort((a,b)=>Date.parse(b.publishedAt??b.updatedAt!)-Date.parse(a.publishedAt??a.updatedAt!)).slice(0,q.limit).map(a=>({...a,publishedAtBangkok:bangkok(a.publishedAt),updatedAtBangkok:bangkok(a.updatedAt)}))};
}

const hex=z.string().regex(/^[a-f0-9]{64}$/), bitcoinAddress=z.string().regex(/^(?:bc1[ac-hj-np-z02-9]{11,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/);
const output=z.object({value:z.number().int().min(0).max(2_100_000_000_000_000),scriptpubkey_address:z.string().max(100).optional()});
const txSchema=z.object({txid:hex,vin:z.array(z.object({is_coinbase:z.boolean().optional(),prevout:output.nullish()})).max(10000),vout:z.array(output).max(10000),status:z.object({confirmed:z.boolean(),block_hash:hex.optional(),block_height:z.number().int().optional(),block_time:z.number().int().optional()}).optional()});
const blockSchema=z.object({id:hex,timestamp:z.number().int().positive(),height:z.number().int().nonnegative(),tx_count:z.number().int().nonnegative().optional()});
export const chainQuerySchema=z.object({address:bitcoinAddress.nullable(),minBTC:z.number().finite().min(0.001).max(21000000),limit:z.number().int().min(1).max(20)}).strict();
export function bitcoinTransfers(raw:unknown,block:z.infer<typeof blockSchema>,minBTC:number,address?:string|null) {
  const txs=z.array(txSchema).max(25).parse(raw);
  return txs.flatMap(tx=>{
    if(tx.vin.some(v=>v.is_coinbase)||!tx.vout.length) return [];
    const largest=tx.vout.reduce((a,b)=>a.value>b.value?a:b), net=address?(tx.vout.filter(o=>o.scriptpubkey_address===address).reduce((s,o)=>s+o.value,0)-tx.vin.filter(v=>v.prevout?.scriptpubkey_address===address).reduce((s,v)=>s+v.prevout!.value,0))/1e8:null;
    if((address?Math.abs(net!):largest.value/1e8)<minBTC) return [];
    return [{txid:tx.txid,blockHash:block.id,blockHeight:block.height,blockTime:new Date(block.timestamp*1000).toISOString(),largestOutputBTC:largest.value/1e8,largestOutputAddress:largest.scriptpubkey_address??null,netAddressBTC:net,owner:'UNKNOWN',url:'https://mempool.space/tx/'+tx.txid,
      interpretation:'Transfer outputs may include change/internal transfers; not proof of buying or accumulation.'}];
  });
}
export async function readChainActivity(raw:unknown,read=readPublicText) {
  const q=chainQuerySchema.parse(raw), now=Date.now();
  let items:ReturnType<typeof bitcoinTransfers>=[], inspected=0, total=0, latest:number|null=null;
  if(q.address) {
    const txs=z.array(txSchema).max(25).parse(JSON.parse(await read('https://mempool.space/api/address/'+q.address+'/txs/chain',60000)));
    inspected=txs.length;
    for(const tx of txs) if(tx.status?.confirmed&&tx.status.block_hash&&tx.status.block_height!==undefined&&tx.status.block_time) {
      latest=Math.max(latest??0,tx.status.block_time*1000);
      items.push(...bitcoinTransfers([tx],{id:tx.status.block_hash,height:tx.status.block_height,timestamp:tx.status.block_time},q.minBTC,q.address));
    }
  } else {
    const blocks=z.array(blockSchema).min(1).max(15).parse(JSON.parse(await read('https://mempool.space/api/blocks',60000))).slice(0,2);
    latest=blocks[0].timestamp*1000;
    const pages=await Promise.all(blocks.flatMap(block=>[0,25].filter(start=>start<(block.tx_count??50)).map(async start=>{
      const txs=JSON.parse(await read(`https://mempool.space/api/block/${block.id}/txs/${start}`,60000));
      return {items:bitcoinTransfers(txs,block,q.minBTC),count:txs.length};
    })));
    inspected=pages.reduce((s,p)=>s+p.count,0);total=blocks.reduce((s,b)=>s+(b.tx_count??0),0);items=pages.flatMap(p=>p.items);
  }
  return {chain:'Bitcoin',asset:'BTC',source:'mempool.space',asOf:new Date(now).toISOString(),address:q.address,thresholdBTC:q.minBTC,
    scope:q.address?'Most recent 25 confirmed transactions for one address; address is not a verified owner/wallet cluster.':'First 50 transactions from each of the latest two blocks, excluding mining rewards; sampled by deterministic position, NOT random, not a global whale ranking.',
    samplingMethod:q.address?'LATEST_25_CONFIRMED_ADDRESS_TRANSACTIONS':'FIRST_50_PER_BLOCK',samplingRandom:false,maximumBlocks:q.address?null:2,
    inspectedTransactions:inspected,totalBlockTransactions:q.address?null:total,latestObservedAt:latest?new Date(latest).toISOString():null,status:latest!==null&&latest<=now+5000?'OBSERVED':'UNAVAILABLE',
    limitations:'BTC only. Outputs can be change/internal transfers; net address flow is not owner accumulation or a trade. No wallet-owner labels, other-chain coverage, continuous monitoring or intent inference.',
    items:[...new Map(items.map(item=>[item.txid,item])).values()].sort((a,b)=>Date.parse(b.blockTime)-Date.parse(a.blockTime)||b.largestOutputBTC-a.largestOutputBTC).slice(0,q.limit)};
}
