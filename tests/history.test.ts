import { test } from "node:test";
import assert from "node:assert/strict";
import { readonlyPermissions, historyClient, verifyHistoryPermissions } from "../src/history.js";
test("read-only permission must be proven, not assumed from missing fields", () => {
  assert.equal(
    readonlyPermissions("Bybit", { retCode: 0, result: { readOnly: 1 } }),
    true,
  );
  assert.equal(
    readonlyPermissions("Bybit", { retCode: 0, result: { readOnly: 0 } }),
    false,
  );
  assert.equal(readonlyPermissions("Binance", { enableReading: true }), false);
  assert.equal(
    readonlyPermissions("Binance", {
      enableReading: true,
      enableWithdrawals: false,
      enableSpotAndMarginTrading: false,
      enableFutures: false,
      enableMargin: false,
      enableVanillaOptions: false,
      permitsUniversalTransfer: false,
      enableInternalTransfer: false,
    }),
    true,
  );
});

test('new exchanges reject unknown, write-enabled and failed permission responses',()=>{
  assert.equal(readonlyPermissions('OKX',{code:'0',data:[{perm:'read_only'}]}),true);
  for(const perm of ['read_only,trade','read_only,withdraw','',undefined])assert.equal(readonlyPermissions('OKX',{code:'0',data:[{perm}]}),false);
  assert.equal(readonlyPermissions('Bitget',{code:'00000',data:{permType:'read-only'}}),true);
  assert.equal(readonlyPermissions('Bitget',{code:'00000',data:{permType:'read-and-write'}}),false);
  assert.equal(readonlyPermissions('Bitget',{code:'40000',data:{permType:'read-only'}}),false);
  const read={status:'VALID',permissions:'SPOT_ACCOUNT_READ,SPOT_DEAL_READ,'};
  assert.equal(readonlyPermissions('MEXC',read),true);
  assert.equal(readonlyPermissions('MEXC',{...read,permissions:'SPOT_ACCOUNT_READ,'}),false);
  for(const permissions of ['', 'SPOT_ACCOUNT_READ,SPOT_DEAL_READ,SPOT_DEAL_WRITE','SPOT_ACCOUNT_READ,SPOT_DEAL_READ,SPOT_TRANSFER_WRITE','SPOT_ACCOUNT_READ,SPOT_DEAL_READ,UNKNOWN'])assert.equal(readonlyPermissions('MEXC',{...read,permissions}),false);
  assert.equal(readonlyPermissions('MEXC',{...read,status:'FROZEN'}),false);
  for(const exchange of ['MEXC','OKX','Bitget'] as const)assert.equal(readonlyPermissions(exchange,{}),false);
});

test('CCXT exposes the documented read permission endpoints and receives passphrase',async()=>{
  for(const [exchange,method,response] of [
    ['MEXC','spotPrivateGetMyTrades',[]],
    ['OKX','privateGetAccountConfig',{code:'0',data:[{perm:'read_only'}]}],
    ['Bitget','privateUtaGetV3AccountInfo',{code:'00000',data:{permType:'read-only'}}],
  ] as const){
    const client=historyClient(exchange,{apiKey:'test-key',secret:'test-secret',password:'test-passphrase'});
    assert.equal(typeof client[method],'function');assert.equal(client.password,'test-passphrase');
    client[method]=async(params?:unknown)=>{if(exchange==='MEXC')assert.deepEqual(params,{symbol:'BTCUSDT',limit:1});return response;};
    if(exchange==='Bitget')client.privateUtaGetV3TradeFills=async()=>({code:'00000',data:{list:[]}});
    await verifyHistoryPermissions(exchange,client);await client.close();
  }
});

test('real CCXT signs GET requests and normalizes exchange trade fixtures',async()=>{
  const timestamp=Date.now(), since=timestamp-1000;
  for(const exchange of ['MEXC','OKX','Bitget'] as const){
    const api=historyClient(exchange,{apiKey:'fixture-key',secret:'fixture-secret',password:'fixture-pass'});
    api.setMarkets([{id:exchange==='OKX'?'BTC-USDT':'BTCUSDT',symbol:'BTC/USDT',base:'BTC',quote:'USDT',type:'spot',spot:true,contract:false,active:true}]);
    let calls=0;
    api.fetch=async(url:string,method:string,headers:any)=>{
      assert.equal(method,'GET');assert.ok(headers);calls++;
      if(exchange==='MEXC'){
        if(url.includes('/apiKeyInfo'))return {status:'VALID',permissions:'SPOT_ACCOUNT_READ,SPOT_DEAL_READ'};
        assert.ok(url.includes('/api/v3/myTrades'));assert.ok(url.includes('signature='));
        return [{symbol:'BTCUSDT',id:'1',orderId:'2',price:'100',qty:'2',quoteQty:'200',commission:'0.1',commissionAsset:'USDT',time:timestamp,isBuyer:true,isMaker:false}];
      }
      if(exchange==='OKX'){
        if(url.includes('/account/config'))return {code:'0',data:[{perm:'read_only'}]};
        assert.ok(url.includes('/trade/fills'));assert.ok(headers['OK-ACCESS-SIGN']);
        return {code:'0',data:[{instId:'BTC-USDT',instType:'SPOT',tradeId:'1',ordId:'2',fillPx:'100',fillSz:'2',side:'buy',fee:'-0.1',feeCcy:'USDT',ts:String(timestamp)}]};
      }
      if(url.includes('/v3/account/info'))return {code:'00000',data:{permType:'read-only'}};
      if(url.includes('/v3/trade/fills'))throw new Error('Fixture classic account');
      assert.ok(url.includes('/v2/spot/trade/fills'));assert.ok(headers['ACCESS-SIGN']);
      return {code:'00000',data:[{symbol:'BTCUSDT',tradeId:'1',orderId:'2',priceAvg:'100',size:'2',amount:'200',side:'buy',feeDetail:{feeCoin:'USDT',totalFee:'-0.1'},cTime:String(timestamp)}]};
    };
    await verifyHistoryPermissions(exchange,api);
    const trades=await api.fetchMyTrades('BTC/USDT',since,100);
    assert.ok(calls>=2 && calls<=4);assert.equal(trades.length,1);assert.equal(trades[0].price,100);assert.equal(trades[0].amount,2);assert.equal(trades[0].side,'buy');assert.equal(trades[0].fee.cost,.1);
    await api.close();
  }
});
