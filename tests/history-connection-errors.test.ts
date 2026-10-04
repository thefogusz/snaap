import assert from 'node:assert/strict';
import {test} from 'node:test';
import ccxt from 'ccxt';
import {historyConnectionError,verifyHistoryPermissions} from '../src/history.js';
import {ApiError} from '../src/api.js';
test('Connection errors explain provider failures without exposing credentials',()=>{
 for(const [ErrorType,expected] of [[ccxt.PermissionDenied,'สิทธิ์'],[ccxt.InvalidNonce,'เวลา'],[ccxt.AuthenticationError,'คู่เดียวกัน'],[ccxt.RequestTimeout,'ไม่ทันเวลา'],[ccxt.RateLimitExceeded,'จำกัด'],[ccxt.NetworkError,'เชื่อมต่อ'],[Error,'ยืนยันสิทธิ์']] as const){
  const result=historyConnectionError(new ErrorType('private-secret signed-url signature=fixture'));
  assert.ok(result.message.includes(expected));assert.ok(!result.message.includes('private-secret'));assert.ok(!result.message.includes('signed-url'));
 }
 const original=new ApiError(400,'READ_ONLY_REQUIRED','อ่านอย่างเดียว');assert.equal(historyConnectionError(original),original);
});

test('MEXC Futures read-scope rejection remains fail closed without using Spot metadata',async()=>{
 const api={fetch:async()=>{},contractPrivateGetAccountAssets:async()=>({success:true,code:0,data:[]}),contractPrivateGetOrderListHistoryOrders:async()=>({success:false,code:703,data:[]}),spotPrivateGetMyTrades:async()=>{throw new ccxt.AuthenticationError('mexc {"code":700007,"msg":"private-secret signed-url"}');}};
 await assert.rejects(()=>verifyHistoryPermissions('MEXC',api,'Futures'),(error:any)=>{
  assert.equal(error.code,'MEXC_READ_ACCESS_REQUIRED');
  assert.ok(error.message.includes('Futures'));assert.ok(!error.message.includes('private-secret'));return true;
 });
 await assert.rejects(()=>verifyHistoryPermissions('MEXC',api,'Spot'),ccxt.AuthenticationError);
});

test('MEXC numeric codes distinguish signature, permissions and IP failures without leaking raw errors',()=>{
 for(const [code,reason] of [['700001','รูปแบบ'],['700002','ลายเซ็น'],['700003','เวลา'],['700006','whitelist'],['700007','สิทธิ์']]){
  const error=historyConnectionError(new ccxt.AuthenticationError(`mexc {"code":${code},"msg":"private-secret signed-url"}`),'MEXC');
  assert.ok(error.message.includes(code));assert.ok(error.message.includes(reason));assert.ok(!error.message.includes('private-secret'));
 }
 assert.ok(!historyConnectionError(new Error('mexc {"code":700002}'),'Bybit').message.includes('700002'));
});
