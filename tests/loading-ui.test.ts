import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../dist/loading-ui.js',import.meta.url),'utf8');
const skeleton=vm.runInNewContext(source+';skeletonUI') as (kind:string,label:string)=>string;

test('placeholders announce loading and hide decorative shapes from assistive technology',()=>{
  for(const kind of ['rows','cards','history','chat','chart','market-brief','market-daily','market-positioning','market-specialists']){
    const html=skeleton(kind,'กำลังโหลด');
    assert.match(html,/role="status"/);
    assert.match(html,/aria-hidden="true"/);
    assert.match(html,/กำลังโหลด/);
    assert.doesNotMatch(html,/<button|<input|<img|<canvas/);
  }
});

test('loading labels are escaped rather than interpreted as markup',()=>{
  const html=skeleton('rows','<img src=x onerror="bad()">');
  assert.doesNotMatch(html,/<img/);
  assert.match(html,/&lt;img/);
});

test('one shared visibility listener pauses loading motion while the tab is hidden',()=>{
  let paused=false;
  const listeners=new Map<string,()=>void>();
  const document={hidden:false,documentElement:{toggleAttribute:(_name:string,value:boolean)=>{paused=value;}},
    addEventListener:(name:string,callback:()=>void)=>listeners.set(name,callback)};
  vm.runInNewContext(source,{document});
  assert.equal(paused,false);
  assert.equal(listeners.size,1);
  document.hidden=true;listeners.get('visibilitychange')!();assert.equal(paused,true);
  document.hidden=false;listeners.get('visibilitychange')!();assert.equal(paused,false);
});
