import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readonlyPermissions,historyClient,resolveHistoryMarket,normalizeHistoryTrade} from '../src/history.js';
import {mergeTrades} from '../src/domain/imports.js';
test('MEXC Futures-only credentials do not need Spot rights',()=>{
 const data={status:'VALID',permissions:'CONTRACT_ACCOUNT_READ,CONTRACT_DEAL_READ'};
 assert.equal(readonlyPermissions('MEXC',data,'Futures'),true);
 assert.equal(readonlyPermissions('MEXC',data,'Spot'),false);
 assert.equal(readonlyPermissions('MEXC',{...data,permissions:data.permissions+',CONTRACT_DEAL_WRITE'},'Futures'),false);
 assert.equal(readonlyPermissions('MEXC',{...data,permissions:'CONTRACT_ACCOUNT_READ'},'Futures'),false);
});
test('Clients route Spot and Futures separately for every exchange',async()=>{
 for(const exchange of ['Binance','Bybit','OKX','Bitget','MEXC'] as const){
 const spot=historyClient(exchange,{},'Spot'),futures=historyClient(exchange,{},'Futures');
 assert.equal(spot.options.defaultType,'spot');assert.equal(futures.options.defaultType,exchange==='Binance'?'future':'swap');await spot.close();await futures.close();
 }
});
test('Same trade id in Spot and Futures is not a duplicate',()=>{
 const row:{id:string;exchange:string;pair:string;market?:string}={id:'same',exchange:'MEXC',pair:'BTC/USDT'};
 assert.equal(mergeTrades([row],[{...row,market:'Futures'}]).rows.length,1);
 assert.equal(mergeTrades([row],[{...row,market:'Spot'}]).rows.length,0);
});

test('Contract resolution never silently selects Spot or an ambiguous Futures instrument',()=>{
 const spot={symbol:'BTC/USDT',spot:true},linear={symbol:'BTC/USDT:USDT',swap:true,linear:true};
 assert.equal(resolveHistoryMarket({'BTC/USDT':spot,'BTC/USDT:USDT':linear},'BTC/USDT','Futures'),linear);
 assert.throws(()=>resolveHistoryMarket({'BTC/USDT':spot},'BTC/USDT','Futures'));
 assert.throws(()=>resolveHistoryMarket({'BTC/USDT:USDT':linear},'BTC/USDT:USDT','Spot'));
 const inverse={symbol:'BTC/USDT:BTC',future:true};
 assert.throws(()=>resolveHistoryMarket({a:linear,b:inverse},'BTC/USDT','Futures'),/หลายสัญญา/);
});
test('Contract amounts preserve units and do not infer position direction from buy/sell',()=>{
 const fill={id:'a',timestamp:Date.now(),amount:2,price:100,side:'buy',info:{side:'2'}};
 const m={symbol:'BTC/USDT:USDT',contractSize:.01,linear:true,settle:'USDT'};
 const row=normalizeHistoryTrade(fill,m,'MEXC','Futures');assert.equal(row.quantity,.02);assert.equal(row.contracts,2);assert.equal(row.positionSide,'SHORT');
 assert.equal(normalizeHistoryTrade({...fill,info:{}},m,'Bybit','Futures').positionSide,undefined);
 assert.equal(normalizeHistoryTrade(fill,{...m,inverse:true,linear:false,contractSize:10},'MEXC','Futures').quantity,.2);
 assert.throws(()=>normalizeHistoryTrade(fill,{...m,contractSize:undefined},'MEXC','Futures'));
});
