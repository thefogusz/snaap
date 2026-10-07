import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNewsFeed, bitcoinTransfers, newsQuerySchema, chainQuerySchema, readPublicText, readMarketNews, readChainActivity } from '../src/research-evidence.js';

test('publisher evidence preserves publication versus update dates and rejects unsafe or unrelated links', () => {
 const now=Date.now(), published=new Date(now-1000).toISOString(), updated=new Date(now-500).toISOString();
 const rss=`<rss><channel><item><title><![CDATA[AI &amp; earnings <b>update</b>]]></title><link>https://nvidianews.nvidia.com/news/a</link><pubDate>${published}</pubDate></item><item><title>unsafe</title><link>javascript:alert(1)</link><pubDate>${published}</pubDate></item><item><title>external</title><link>https://attacker.invalid/a</link><pubDate>${published}</pubDate></item></channel></rss>`;
 const rows=parseNewsFeed(rss,'NVDA','https://nvidianews.nvidia.com/releases.xml',now);
 assert.equal(rows.length,1); assert.equal(rows[0].title,'AI & earnings update'); assert.equal(rows[0].publishedAt,published);
 const atom=`<feed><entry><title>Product update</title><link rel="self" href="https://www.apple.com/newsroom/rss-feed.rss"/><link href="https://www.apple.com/newsroom/a"/><updated>${updated}</updated></entry></feed>`;
 const apple=parseNewsFeed(atom,'AAPL','https://www.apple.com/newsroom/rss-feed.rss',now)[0];
 assert.equal(apple.publishedAt,null); assert.equal(apple.updatedAt,updated); assert.equal(apple.dateBasis,'UPDATED');
 assert.equal(apple.url,'https://www.apple.com/newsroom/a');
 assert.throws(()=>parseNewsFeed('<!DOCTYPE feed [<!ENTITY a "x">]><feed/>','AAPL','https://www.apple.com/newsroom/rss-feed.rss',now));
 assert.equal(parseNewsFeed(`<feed><entry><title>Future</title><link href="https://www.apple.com/newsroom/a"/><updated>${new Date(now+86400000).toISOString()}</updated></entry></feed>`,'AAPL','https://www.apple.com/newsroom/rss-feed.rss',now).length,0);
});

test('Bitcoin evidence excludes mining rewards and never treats change outputs as known whale buys', () => {
 const hash='a'.repeat(64), txid='b'.repeat(64);
 const tx={txid,vin:[{prevout:{value:20000000000,scriptpubkey_address:'sender'}}],vout:[{value:15000000000,scriptpubkey_address:'change-or-recipient'},{value:4999900000,scriptpubkey_address:'other'}]};
 const rows=bitcoinTransfers([tx,{...tx,txid:'c'.repeat(64),vin:[{is_coinbase:true,prevout:null}]}],{id:hash,timestamp:1000,height:1},100);
 assert.equal(rows.length,1); assert.equal(rows[0].largestOutputBTC,150); assert.equal(rows[0].owner,'UNKNOWN');
 assert.equal(rows[0].interpretation,'Transfer outputs may include change/internal transfers; not proof of buying or accumulation.');
 assert.equal(rows[0].url,'https://mempool.space/tx/'+txid);
 assert.equal(bitcoinTransfers([tx],{id:hash,timestamp:1000,height:1},200).length,0);
 assert.throws(()=>bitcoinTransfers([{...tx,vout:[{value:-1}]}],{id:hash,timestamp:1000,height:1},1));
 assert.equal(chainQuerySchema.safeParse({address:'http://localhost',minBTC:100,limit:10}).success,false);
 assert.equal(newsQuerySchema.safeParse({topic:'stocks',symbols:[],hours:24,limit:1000,query:''}).success,false);
});

test('public evidence reads coalesce, reject redirects/oversized bodies and do not cache failures as evidence', async () => {
 const original=globalThis.fetch; let calls=0;
 try {
  globalThis.fetch=async()=>{calls++;return new Response('feed');};
  const url='https://www.apple.com/newsroom/cache-test';
  const values=await Promise.all(Array.from({length:1000},()=>readPublicText(url,60000)));
  assert.equal(calls,1); assert.ok(values.every(v=>v==='feed'));
  globalThis.fetch=async()=>new Response('',{status:302,headers:{location:'http://localhost/secret'}});
  await assert.rejects(readPublicText('https://www.apple.com/newsroom/redirect-test',60000));
  globalThis.fetch=async()=>new Response('x'.repeat(1_500_001));
  await assert.rejects(readPublicText('https://www.apple.com/newsroom/size-test',60000));
  await assert.rejects(readPublicText('https://localhost/secret',60000));
  globalThis.fetch=async()=>{throw new Error('offline');};
  await assert.rejects(readPublicText('https://www.apple.com/newsroom/fail-test',60000));
 } finally {globalThis.fetch=original;}
});

test('public RPC only permits read methods, isolates bodies in cache and rejects HTTP 200 RPC errors', async () => {
 const original=globalThis.fetch;let calls=0;
 try {
  globalThis.fetch=async(_url,options)=>{calls++;const request=JSON.parse(options!.body as string);assert.equal(request.method,'eth_chainId');return Response.json({jsonrpc:'2.0',id:1,result:'0x1'});};
  const reads=await Promise.all(Array.from({length:1000},()=>readPublicText('https://ethereum-rpc.publicnode.com/',60000,{method:'eth_chainId',params:[]})));
  assert.equal(calls,1);assert.ok(reads.every(r=>JSON.parse(r).result==='0x1'));
  await assert.rejects(readPublicText('https://ethereum-rpc.publicnode.com/',60000,{method:'eth_sendRawTransaction' as any,params:['secret']}));
  await assert.rejects(readPublicText('https://www.apple.com/',60000,{method:'eth_chainId',params:[]}));
  globalThis.fetch=async()=>{calls++;return Response.json({jsonrpc:'2.0',id:1,error:{code:-32000,message:'busy'}});};
  await assert.rejects(readPublicText('https://ethereum-rpc.publicnode.com/',60000,{method:'eth_getBlockByNumber',params:['finalized',false]}));
  assert.equal(calls,2);
  await assert.rejects(readPublicText('https://ethereum-rpc.publicnode.com/',60000,{method:'eth_getBlockByNumber',params:['finalized',false]}));
  assert.equal(calls,2,'failed RPC gets cooldown, not fabricated cached success');
 } finally {globalThis.fetch=original;}
});

test('distinct DeFi queries stop at the conservative free-source cold-read budget', async () => {
 const original=globalThis.fetch;let calls=0;
 try {
  globalThis.fetch=async()=>{calls++;return new Response('1');};
  for(let i=0;i<30;i++) await readPublicText('https://api.llama.fi/tvl/budget-test-'+i,600000);
  await assert.rejects(readPublicText('https://api.llama.fi/tvl/budget-overflow',600000));
  assert.equal(calls,30);
  assert.equal(await readPublicText('https://api.llama.fi/tvl/budget-test-0',600000),'1','cached data remains available when cold budget is exhausted');
 } finally {globalThis.fetch=original;}
});

test('news returns original announcement links, partial coverage and unsupported symbols honestly', async () => {
 const now=Date.now();
 const query={topic:'all',symbols:[],hours:24,limit:10,query:''};
 const result=await readMarketNews(query,async url=>{if(!url.includes('gateio.ws')) throw new Error('offline');return JSON.stringify({code:0,data:{list:[{title:'New listing',url:'/announcements/article/123',release_timestamp:String(Math.floor(now/1000))}]}});});
 assert.equal(result.items[0].url,'https://www.gate.com/announcements/article/123');
 assert.equal(result.sources.filter(s=>s.status==='UNAVAILABLE').length,3);
 assert.equal(result.items[0].publishedAtBangkok,new Date(Math.floor(now/1000)*1000+7*3600000).toISOString().slice(0,19)+'+07:00');
 const unsupported=await readMarketNews({...query,topic:'stocks',symbols:['UNKNOWN']},async()=>{throw new Error('must not fetch');});
 assert.equal(unsupported.items.length,0);assert.equal(unsupported.sources[0].status,'UNSUPPORTED');
 await assert.rejects(readMarketNews(query,async()=>{throw new Error('offline');}));
});

test('chain requests are bounded samples with exact transaction evidence and address net flow', async () => {
 const hash='a'.repeat(64), txid='b'.repeat(64), address='1BoatSLRHtKNngkdXEeobR76b53LETtpyT', time=Math.floor(Date.now()/1000);
 const tx={txid,vin:[{prevout:{value:15000000000,scriptpubkey_address:'other'}}],vout:[{value:14999900000,scriptpubkey_address:address}],status:{confirmed:true,block_hash:hash,block_height:1,block_time:time}};
 const urls:string[]=[];
 const read=async(url:string)=>{urls.push(url);return JSON.stringify(url.endsWith('/api/blocks')?[{id:hash,height:1,timestamp:time,tx_count:1000}]:[tx]);};
 const sample=await readChainActivity({address:null,minBTC:100,limit:10},read);
 assert.equal(urls.length,3);assert.equal(sample.inspectedTransactions,2);assert.equal(sample.totalBlockTransactions,1000);
 assert.match(sample.scope,/sampled/);
 const wallet=await readChainActivity({address,minBTC:100,limit:10},read);
 assert.equal(wallet.items[0].netAddressBTC,149.999);assert.equal(wallet.items[0].owner,'UNKNOWN');
});
