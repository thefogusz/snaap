import {test} from 'node:test';
import assert from 'node:assert/strict';
import {indicator, value, type Candle, type Operand} from '../src/domain/engine.js';

const step=300000;
function candles(count:number,from=0,gapAt?:number):Candle[]{
  return Array.from({length:count},(_,i)=>{
    const price=100+Math.sin((i+from)/9)*5+(i+from)*0.01;
    return {time:(i+from+(gapAt!==undefined&&i>=gapAt?1:0))*step,open:price,high:price+1,low:price-1,close:price,volume:100};
  });
}
const operand=(name:string,period:number,extra:object={}):Operand=>({kind:'INDICATOR',name,period,timeframe:'5m',...extra} as Operand);

test('built-in indicator results match a direct calculation and repeat identically',()=>{
  const rows=candles(400);
  const at=rows.at(-1)!.time;
  for(const [name,period] of [['EMA',20],['EMA',200],['RSI',14],['ATR',14],['SMA',50]] as const){
    const expected=indicator(rows,name,period);
    const first=value(operand(name,period),{'5m':rows},at);
    const second=value(operand(name,period),{'5m':rows},at);
    assert.ok(Object.is(first,expected),`${name}(${period}) first call`);
    assert.ok(Object.is(second,expected),`${name}(${period}) cached call`);
  }
});

test('different history windows never share a cached result',()=>{
  const long=candles(500), short=long.slice(250);
  const at=long.at(-1)!.time;
  const fromLong=value(operand('EMA',200),{'5m':long},at);
  const fromShort=value(operand('EMA',200),{'5m':short},at);
  assert.ok(Object.is(fromLong,indicator(long,'EMA',200)));
  assert.ok(Object.is(fromShort,indicator(short,'EMA',200)));
  assert.notEqual(fromLong,fromShort,'EMA seeds differ with the warmup window');
});

test('different evaluation times on one array use their own closed prefix',()=>{
  const rows=candles(400);
  const series={'5m':rows};
  for(const index of [150,250,399]){
    const expected=indicator(rows.slice(0,index+1),'RSI',14);
    assert.ok(Object.is(value(operand('RSI',14),series,rows[index].time),expected),`bar ${index}`);
  }
});

test('operand parameters are part of the cache key and a recent gap stays unavailable',()=>{
  const rows=candles(300);
  const series={'5m':rows};
  const at=rows.at(-1)!.time;
  const close=value(operand('SMA',20),series,at), hl2=value(operand('SMA',20,{source:'hl2'}),series,at);
  assert.ok(Object.is(close,indicator(rows,'SMA',20)));
  assert.ok(hl2!==undefined&&Math.abs(hl2-close!)<1e-9,'flat high/low around close keeps hl2 equal here');
  const macdSlow=value(operand('MACD',12,{slow:26,signal:9}),series,at), macdOther=value(operand('MACD',12,{slow:35,signal:9}),series,at);
  assert.notEqual(macdSlow,macdOther);
  const gapped=candles(300,0,290);
  assert.equal(value(operand('SMA',20),{'5m':gapped},gapped.at(-1)!.time),undefined);
  assert.equal(value(operand('SMA',20),{'5m':gapped},gapped.at(-1)!.time),undefined,'cached undefined stays undefined');
});
