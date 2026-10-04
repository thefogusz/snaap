import {test} from 'node:test';
import assert from 'node:assert/strict';
import {historyClient,fetchHistoryTrades,validHistoryTrades,readonlyPermissions,verifyHistoryPermissions,historyExchanges} from '../src/history.js';

const reading={enableReading:true,enableWithdrawals:false,enableSpotAndMarginTrading:false,enableFutures:false,enableMargin:false,enableVanillaOptions:false,permitsUniversalTransfer:false,enableInternalTransfer:false};
test('Binance rejects additional write capabilities and malformed capability values',()=>{
 for(const key of ['enableFixApiTrade','enablePortfolioMarginTrading']) {
  for(const value of [true,'false',null,1])assert.equal(readonlyPermissions('Binance',{...reading,[key]:value}),false);
  assert.equal(readonlyPermissions('Binance',{...reading,[key]:false}),true);
 }
});

for(const exchange of historyExchanges)for(const type of ['Spot','Futures'] as const) {
 test(`${exchange} ${type}: signed permission request uses expected endpoint`,async()=>{
  const api=historyClient(exchange,{apiKey:'fixture-key',secret:'fixture-secret',password:'fixture-pass'},type);
  const paths={Binance:'/sapi/v1/account/apiRestrictions',Bybit:'/v5/user/query-api',OKX:'/api/v5/account/config',Bitget:'/api/v3/account/info',MEXC:'/api/v3/myTrades'};
  const responses={Binance:reading,Bybit:{retCode:0,result:{readOnly:1}},OKX:{code:'0',data:[{perm:'read_only'}]},Bitget:{code:'00000',data:{permType:'read-only'}},MEXC:{status:'VALID',permissions:type==='Spot'?'SPOT_ACCOUNT_READ,SPOT_DEAL_READ':'CONTRACT_ACCOUNT_READ,CONTRACT_DEAL_READ'}};
  let calls=0;
  api.fetch=async(url:string,method:string,headers:any)=>{
   calls++;assert.equal(method,'GET');
   if(exchange==='MEXC' && type==='Futures'){
    assert.equal(new URL(url).pathname,'/api/v1/private/order/list/history_orders');
    assert.ok(headers.Signature);return {success:true,code:0,data:[]};
   }
   if(exchange==='Bitget'&&new URL(url).pathname==='/api/v3/trade/fills'){assert.ok(headers['ACCESS-SIGN']);return {code:'00000',data:{list:[]}};}
   assert.equal(new URL(url).pathname,paths[exchange]);
   const signature={Binance:new URL(url).searchParams.get('signature'),Bybit:headers['X-BAPI-SIGN'],OKX:headers['OK-ACCESS-SIGN'],Bitget:headers['ACCESS-SIGN'],MEXC:new URL(url).searchParams.get('signature')};
   assert.ok(signature[exchange]);return exchange==='MEXC'?[]:responses[exchange];
  };
  try {await verifyHistoryPermissions(exchange,api,type);assert.equal(calls,exchange==='Bitget'?2:1);}finally{await api.close();}
 });
 test(`${exchange} ${type}: selected market, symbol and date bounds reach signed history request`,async()=>{
  const api=historyClient(exchange,{apiKey:'fixture-key',secret:'fixture-secret',password:'fixture-pass'},type);
  if(exchange==='Bitget')api.options.uta=false;
  const spot=type==='Spot',symbol=spot?'BTC/USDT':'BTC/USDT:USDT';
  const id=exchange==='OKX'?(spot?'BTC-USDT':'BTC-USDT-SWAP'):exchange==='MEXC'&&!spot?'BTC_USDT':'BTCUSDT';
  const market={id,symbol,base:'BTC',quote:'USDT',settle:spot?undefined:'USDT',type:spot?'spot':'swap',spot,swap:!spot,future:false,contract:!spot,linear:!spot,inverse:false,contractSize:1,active:true};
  api.setMarkets([market]);const until=Date.now(),from=until-3600000;let calls=0;
  api.fetch=async(url:string,method:string)=>{
   calls++;assert.equal(method,'GET');const u=new URL(url),q=u.searchParams;
   assert.ok(!u.pathname.includes('apiKeyInfo'));
   assert.equal(q.get(exchange==='OKX'?'instId':'symbol'),id);
   assert.equal(Number(q.get(exchange==='OKX'?'begin':exchange==='MEXC'&&!spot?'start_time':'startTime')),from);
   assert.equal(Number(q.get(exchange==='OKX'?'end':exchange==='MEXC'&&!spot?'end_time':'endTime')),until);
   if(exchange==='Bybit'){assert.equal(q.get('category'),spot?'spot':'linear');return {retCode:0,result:{list:[]}};}
   if(exchange==='OKX')return {code:'0',data:[]};
   if(exchange==='Bitget')return {code:'00000',data:spot?[]:{fillList:[]}};
   if(exchange==='MEXC'&&!spot)return {success:true,code:0,data:[]};
   return [];
  };
  try {assert.deepEqual(await fetchHistoryTrades(api,exchange,market,from,until),[]);assert.equal(calls,1);}finally{await api.close();}
 });
}

for(const [spot,settle,inverse,category] of [[true,undefined,false,'SPOT'],[false,'USDT',false,'USDT-FUTURES'],[false,'USDC',false,'USDC-FUTURES'],[false,'BTC',true,'COIN-FUTURES']] as const) {
 test(`Bitget UTA ${category} explicitly filters symbol/category before limiting`,async()=>{
  const api=historyClient('Bitget',{apiKey:'fixture-key',secret:'fixture-secret',password:'fixture-pass'},spot?'Spot':'Futures');api.options.uta=true;
  const symbol=spot?'BTC/USDT':`BTC/USDT:${settle}`;
  const market={id:'BTCUSDT',symbol,base:'BTC',quote:'USDT',settle,type:spot?'spot':'swap',spot,swap:!spot,contract:!spot,linear:!spot&&!inverse,inverse,contractSize:1};api.setMarkets([market]);
  api.fetch=async(url:string,method:string)=>{
   const u=new URL(url);assert.equal(method,'GET');assert.equal(u.pathname,'/api/v3/trade/fills');assert.equal(u.searchParams.get('symbol'),market.id);assert.equal(u.searchParams.get('category'),category);assert.equal(u.searchParams.get('limit'),'100');return {code:'00000',data:{list:[]}};
  };
  try{assert.deepEqual(await fetchHistoryTrades(api,'Bitget',market,1000,2000),[]);}finally{await api.close();}
 });
}

test('History ingestion excludes wrong instrument, out-of-window and invalid fills',()=>{
 const market={symbol:'BTC/USDT:USDT'};
 const trade={id:'1',symbol:market.symbol,timestamp:1500,price:100,amount:1,side:'buy'};
 const rows=[trade,{...trade,symbol:'BTC/USDT'},{...trade,timestamp:999},{...trade,timestamp:2001},{...trade,amount:NaN},{...trade,price:0},{...trade,side:'unknown'}];
 assert.deepEqual(validHistoryTrades(rows,market,1000,2000),[trade]);
});
