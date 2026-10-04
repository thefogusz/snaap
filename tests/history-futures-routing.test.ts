import {test} from 'node:test';
import assert from 'node:assert/strict';
import {historyClient} from '../src/history.js';
test('Real CCXT routes Futures history to authenticated read endpoints on all exchanges',async()=>{
 const timestamp=Date.now();
 for(const exchange of ['Binance','Bybit','OKX','Bitget','MEXC'] as const){
 const api=historyClient(exchange,{apiKey:'fixture-key',secret:'fixture-secret',password:'fixture-pass'},'Futures');
 if(exchange==='Bitget')api.options.uta=false;
 const symbol='BTC/USDT:USDT',id=exchange==='OKX'?'BTC-USDT-SWAP':exchange==='MEXC'?'BTC_USDT':'BTCUSDT';
 api.setMarkets([{id,symbol,base:'BTC',quote:'USDT',settle:'USDT',type:'swap',spot:false,swap:true,future:false,contract:true,linear:true,inverse:false,contractSize:1,active:true}]);
 let calls=0;
 api.fetch=async(url:string,method:string,headers:any)=>{
  calls++;assert.equal(method,'GET');assert.ok(headers);
  if(exchange==='Binance'){assert.ok(url.includes('/fapi/v1/userTrades'));assert.ok(url.includes('signature='));return [];}
  if(exchange==='Bybit'){assert.ok(url.includes('/v5/execution/list'));assert.ok(url.includes('category=linear'));assert.ok(headers['X-BAPI-SIGN']);return {retCode:0,result:{list:[],nextPageCursor:''}};}
  if(exchange==='OKX'){assert.ok(url.includes('/trade/fills-history'));assert.ok(url.includes('instType=SWAP'));assert.ok(headers['OK-ACCESS-SIGN']);return {code:'0',data:[]};}
  if(exchange==='Bitget'){assert.ok(url.includes('/v2/mix/order/fills'));assert.ok(headers['ACCESS-SIGN']);return {code:'00000',data:{fillList:[]}};}
  assert.ok(url.includes('/order/list/order_deals'));assert.ok(headers['Signature']);return {success:true,code:0,data:[]};
 };
 const fills=await api.fetchMyTrades(symbol,timestamp-1000,100,exchange==='MEXC'?{end_time:timestamp}:{until:timestamp});assert.deepEqual(fills,[]);assert.equal(calls,1,exchange+' unexpected request count');await api.close();
 }
});
