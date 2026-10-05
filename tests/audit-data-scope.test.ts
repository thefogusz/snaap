import {test} from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import type pg from 'pg';
import {registerFiles} from '../src/files.js';
import {protectHistoryTransport,historyExchanges} from '../src/history.js';
import {strategySchema} from '../src/domain/engine.js';

test('24 leaf conditions are accepted and 25 rejected across lifecycle branches',()=>{
 const condition={kind:'COMPARE',op:'>',left:{kind:'PRICE',field:'close',timeframe:'5m'},right:{kind:'CONSTANT',value:100}};
 const group=(n:number)=>({kind:'GROUP',op:'AND',children:Array(n).fill(condition)});
 const spec={schemaVersion:2,name:'Audit limits',exchange:['MEXC'],market:'Spot',pairs:['BTC/USDT'],timeframe:'5m',entry:group(12),stages:[],cooldownBars:0,destinations:[]};
 assert.equal(strategySchema.safeParse({...spec,exit:group(12)}).success,true);
 assert.equal(strategySchema.safeParse({...spec,exit:group(12),cancel:condition}).success,false);
 assert.equal(strategySchema.safeParse({...spec,market:'Perpetual Futures',side:'BOTH',short:{entry:group(12),stages:[],cooldownBars:0}}).success,true);
 assert.equal(strategySchema.safeParse({...spec,market:'Perpetual Futures',side:'BOTH',cancel:condition,short:{entry:group(12),stages:[],cooldownBars:0}}).success,false);
 assert.equal(strategySchema.safeParse({...spec,market:'Perpetual Futures',side:'BOTH',mirrorShort:true,exit:group(12)}).success,true);
});

test('image deletion honors owner and selected workspace scope',async()=>{
 const owner='00000000-0000-4000-8000-000000000001',workspace='00000000-0000-4000-8000-000000000002',id='00000000-0000-4000-8000-000000000003';
 let statement='',values:unknown[]=[];
 const db={query:async(sql:string,args:unknown[]=[])=>{if(sql.startsWith('DELETE FROM assets')){statement=sql;values=args;}return {rowCount:0,rows:[]};}} as unknown as pg.Pool;
 const app=Fastify();app.addHook('onRequest',async req=>{req.userId=owner;req.workspaceId=workspace;});
 await registerFiles(app,db);
 try{
  assert.equal((await app.inject({method:'DELETE',url:`/api/v1/images/${id}`})).statusCode,200);
  assert.match(statement,/owner_id=\$2/);
  assert.match(statement,/data_scopes/);
  assert.match(statement,/workspace_ids/);
  assert.deepEqual(values,[id,owner,workspace]);
 }finally{await app.close();}
});

for(const exchange of historyExchanges)test(`${exchange} history transport denies balances, writes and credential destinations before network`,async()=>{
 let calls=0;const api:any={fetch:async()=>{calls++;return {};}};protectHistoryTransport(api,exchange);
 const host={Binance:'api.binance.com',Bybit:'api.bybit.com',OKX:'www.okx.com',Bitget:'api.bitget.com',MEXC:'api.mexc.com'}[exchange];
 for(const [url,method] of [
  [`https://${host}/account/assets`,'GET'],[`https://${host}/order`,'POST'],[`https://${host}/order`,'DELETE'],
  ['https://example.com/api/v3/myTrades','GET'],[`http://${host}/api/v3/myTrades`,'GET'],
  [`https://${host}:8443/api/v3/myTrades`,'GET'],[`https://user:password@${host}/api/v3/myTrades`,'GET'],
 ])await assert.rejects(()=>api.fetch(url,method),(error:any)=>error.code==='HISTORY_READ_ONLY');
 assert.equal(calls,0);
});
