import {test} from 'node:test';
import assert from 'node:assert/strict';
import {operand, value, strategySchema, type Candle} from '../src/domain/engine.js';
import {preview} from '../src/domain/preview.js';
import {extendedIndicators} from '../dist/indicator-catalog.js';
// Discovery data is served directly to the browser.
import {basicIndicators} from '../dist/basic-indicators.js';

test('basic discovery covers every engine study and every default evaluates', () => {
  const studies = [...basicIndicators, ...extendedIndicators];
  const indicatorSchema = operand.options[2];
  const names = indicatorSchema.shape.name.options.filter(n => n !== 'CUSTOM');
  assert.deepEqual(studies.map(d => d.name).sort(), [...names].sort());
  const candles:Candle[] = Array.from({length:600},(_,i) => ({time:(i+1)*900000,open:100+i*.1,close:101+i*.1+Math.sin(i),high:103+i*.1,low:99+i*.1,volume:100+i%31}));
  for (const d of studies) {
    const params = Object.fromEntries((d.params ?? []).filter(p => p.key !== 'period').map(p => [p.key,p.value]));
    const o = operand.parse({kind:'INDICATOR',name:d.name,period:('period' in d ? d.period : d.params?.find(p => p.key === 'period')?.value) ?? 14,timeframe:'15m',...(Object.keys(params).length ? {params} : {})});
    assert.ok(Number.isFinite(value(o,{'15m':candles},candles.at(-1)!.time)), d.name);
    assert.ok(d.label && d.description, d.name);
  }
});

test('Volume is raw closed-bar volume including zero, with no warmup or future leakage', () => {
  const candles:Candle[] = [12.5,0,900].map((volume,i) => ({time:(i+1)*900000,open:10,close:11,high:12,low:9,volume}));
  const volume = operand.parse({kind:'INDICATOR',name:'VOLUME',period:14,timeframe:'15m'});
  const spec = strategySchema.parse({schemaVersion:2,name:'Volume',exchange:['MEXC'],market:'Spot',pairs:['BTC/USDT'],timeframe:'15m',entry:{kind:'COMPARE',op:'>',left:volume,right:{kind:'CONSTANT',value:10}},stages:[],cooldownBars:0,destinations:[]});
  const out = preview(spec,{'15m':candles});
  assert.deepEqual(out.overlays[0].points.map(p => p.value),[12.5,0,900]);
  assert.deepEqual(out.timeline.map(b => b.entry.left),[12.5,0,900]);
  assert.equal(value(volume,{'15m':candles},candles[0].time),12.5);
  assert.equal(value(volume,{'15m':candles},0),undefined);
  assert.equal(value(volume,{'15m':candles},candles[2].time+900000),undefined);
});
