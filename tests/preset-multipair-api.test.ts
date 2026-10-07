import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { ZodError } from 'zod';
import { registerPresets } from '../src/presets.js';

test('preset API accepts ten supported pairs, rejects duplicates, eleven pairs and any unsupported pair', async () => {
 const pairs=['BTC','ETH','SOL','XRP','DOGE','ADA','AVAX','LINK','DOT','LTC'].map(base=>base+'/USDT');
 const conversation='00000000-0000-4000-8000-000000000001';
 let writes=0,refreshRequested=false;
 const client={query:async(sql:string)=>{
  if(sql.startsWith('UPDATE conversations')){writes++;return {rows:[{draft_revision:1}],rowCount:1};}
  if(sql.startsWith('INSERT INTO messages'))return {rows:[{id:'fixture'}],rowCount:1};
  return {rows:[],rowCount:0};
 },release:()=>{}};
 const db={query:async()=>({rows:[{id:conversation}],rowCount:1}),connect:async()=>client};
 const app=Fastify();
 app.decorateRequest('userId','owner');
 app.setErrorHandler((err,_req,reply)=>reply.code(err instanceof ZodError?400:(err as any).statusCode??500).send({error:'fixture'}));
 registerPresets(app,db as any,{instruments:async(exchange,market,refresh)=>{
  assert.equal(exchange,'MEXC');assert.equal(market,'Perpetual Futures');refreshRequested=refresh===true;
  return {at:Date.now(),items:pairs.map(symbol=>({symbol,supported:true}))};
 }});
 const input={presetId:'supertrend',exchange:'MEXC',market:'Perpetual Futures',side:'LONG',timeframe:'1h',expectedRevision:0};
 const submit=(selection:object)=>app.inject({method:'POST',url:`/api/v1/conversations/${conversation}/preset`,payload:{...input,...selection}});
 try{
  const accepted=await submit({pairs});assert.equal(accepted.statusCode,200,accepted.body);assert.deepEqual(accepted.json().spec.pairs,pairs);assert.equal(refreshRequested,true);
  const legacy=await submit({pair:pairs[0]});assert.equal(legacy.statusCode,200);assert.deepEqual(legacy.json().spec.pairs,[pairs[0]]);
  const before=writes;
  for(const selection of [{pairs:[...pairs,'BNB/USDT']},{pairs:[]},{pairs:['BTC/USDT','BTC/USDT']},{pairs:['BTC/USDT','NOTREAL/USDT']},{pair:'BTC/USDT',pairs:['BTC/USDT']},{}])assert.equal((await submit(selection)).statusCode,400);
  assert.equal(writes,before,'invalid selection must not modify the draft');
 }finally{await app.close();}
});

test('preset saves venue-specific pairs without inventing a target on another exchange', async () => {
 const conversation='00000000-0000-4000-8000-000000000002';
 const targets=[{exchange:'Binance',pair:'BTC/USDT'},{exchange:'MEXC',pair:'RARE/USDT'}];
 let stored:any;
 const client={query:async(sql:string,params:any[])=>{
  if(sql.startsWith('UPDATE conversations')){stored=params[0];return {rows:[{draft_revision:1}],rowCount:1};}
  if(sql.startsWith('INSERT INTO messages'))return {rows:[{id:'fixture',ui_card:params[3]}],rowCount:1};
  return {rows:[],rowCount:0};
 },release:()=>{}};
 const app=Fastify();app.decorateRequest('userId','owner');
 app.setErrorHandler((err,_req,reply)=>reply.code(err instanceof ZodError?400:(err as any).statusCode??500).send({error:'fixture'}));
 registerPresets(app,{query:async()=>({rows:[{id:conversation}],rowCount:1}),connect:async()=>client} as any,{instruments:async exchange=>({at:Date.now(),items:[{symbol:exchange==='Binance'?'BTC/USDT':'RARE/USDT',supported:true}]})});
 try{
  const payload={presetId:'trend',exchange:'Binance',market:'Spot',side:'SPOT',pairs:['BTC/USDT','RARE/USDT'],timeframe:'1h',targets,expectedRevision:0};
  const accepted=await app.inject({method:'POST',url:`/api/v1/conversations/${conversation}/preset`,payload});
  assert.equal(accepted.statusCode,200,accepted.body);assert.deepEqual(stored.targets,targets);assert.deepEqual(stored.exchange,['Binance','MEXC']);
  assert.deepEqual(accepted.json().message.ui_card.spec.targets,targets);
  const previous=stored;
  assert.equal((await app.inject({method:'POST',url:`/api/v1/conversations/${conversation}/preset`,payload:{...payload,targets:[...targets,{exchange:'Binance',pair:'RARE/USDT'}]}})).statusCode,400);
  assert.equal(stored,previous);
 }finally{await app.close();}
});
