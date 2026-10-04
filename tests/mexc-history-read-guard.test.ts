import {test} from 'node:test';
import assert from 'node:assert/strict';
import {protectMexcFuturesHistory,verifyHistoryPermissions,historyClient} from '../src/history.js';

test('MEXC history transport blocks writes, unapproved reads and credential destinations before network',async()=>{
 let calls=0;const api:any={fetch:async()=>{calls++;return {};}};protectMexcFuturesHistory(api);
 for(const [url,method] of [
  ['https://api.mexc.com/api/v1/private/order/submit','POST'],
  ['https://api.mexc.com/api/v1/private/account/assets','GET'],
  ['https://api.mexc.com/api/v1/private/account/assets','POST'],
  ['https://api.mexc.com/api/v1/private/account/assets','DELETE'],
  ['https://api.mexc.com/api/v3/apiKeyInfo','GET'],
  ['https://api.mexc.com/api/v3/capital/withdraw','GET'],
  ['https://example.com/api/v1/private/account/assets','GET'],
  ['http://api.mexc.com/api/v1/private/account/assets','GET'],
  ['https://api.mexc.com:8443/api/v1/private/account/assets','GET'],
 ] as const)await assert.rejects(()=>api.fetch(url,method),(e:any)=>e.code==='HISTORY_READ_ONLY');
 assert.equal(calls,0);
 await api.fetch('https://api.mexc.com/api/v1/private/order/list/history_orders','GET');assert.equal(calls,1);
});

test('MEXC Futures client skips Spot-only currency metadata',async()=>{
 const api=historyClient('MEXC',{},'Futures');assert.equal(api.has.fetchCurrencies,false);await api.close();
});

test('MEXC direct read verification never claims full key permission attestation',async()=>{
 let calls=0;const api={fetch:async()=>{},contractPrivateGetAccountAssets:async()=>{throw Error('Account assets must not be called');},contractPrivateGetOrderListHistoryOrders:async()=>{calls++;return {success:true,code:0,data:[]};},spotPrivateGetApiKeyInfo:async()=>{throw Error('Spot must not be called');}};
 assert.equal(await verifyHistoryPermissions('MEXC',api,'Futures'),'READ_ACCESS_VERIFIED');assert.equal(calls,1);
 for(const response of [{success:false,code:0,data:[]},{success:true,code:0},{success:true,code:703,data:[]},{success:true,code:0,data:{}}]){
  api.contractPrivateGetOrderListHistoryOrders=async()=>response as any;
  await assert.rejects(()=>verifyHistoryPermissions('MEXC',api,'Futures'));
 }
});
