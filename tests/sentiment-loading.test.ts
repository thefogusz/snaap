import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const loadingSource=await readFile(new URL('../dist/loading-ui.js',import.meta.url),'utf8');
const skeletonUI=vm.runInNewContext(loadingSource+';skeletonUI');

for(const [file,init,refresh,kind] of [
  ['brief','initBrief','refreshBrief','market-brief'],
  ['daily','initDaily','refreshDaily','market-daily'],
  ['positioning','initPositioning','refreshPositioning','market-positioning'],
]){
  test(`${file} shows a skeleton during first load, clears it on failure, and keeps loaded content on refresh`,async()=>{
    let requests:Array<(value:any)=>void>=[];
    const failRequests=()=>{for(const resolve of requests)resolve({ok:false,status:503});requests=[];};
    const host={innerHTML:'',addEventListener(){},querySelector(){return null;},querySelectorAll(){return [];},contains(){return false;}};
    const source=(await readFile(new URL(`../dist/sentiment-${file}.js`,import.meta.url),'utf8')).replace(/export /g,'');
    const context=vm.createContext({skeletonUI,AbortSignal,document:{activeElement:null},
      fetch:()=>new Promise(resolve=>{requests.push(resolve);}),setInterval,clearInterval});
    vm.runInContext(source,context);
    context.hostElement=host;
    vm.runInContext(`${init}(hostElement,()=>{})`,context);
    assert.match(host.innerHTML,/class="skeleton"/);
    assert.match(host.innerHTML,new RegExp(kind==='market-brief'?'sb-flow-stage':kind==='market-daily'?'sf-loading-plot':'sp-grid'));
    failRequests();
    // Await the pending async refresh and its render after the failed response.
    await new Promise(resolve=>setImmediate(resolve));
    assert.doesNotMatch(host.innerHTML,/class="skeleton"/);
    assert.match(host.innerHTML,/ยัง/);

    const empty=file==='brief'?'daily':file==='daily'?'payload':'data';
    vm.runInContext(`${empty}={markets:[],periods:[]};render=()=>{};`,context);
    host.innerHTML='<div>existing market graphic</div>';
    const pending=vm.runInContext(`${refresh}()`,context);
    assert.equal(host.innerHTML,'<div>existing market graphic</div>');
    failRequests();
    await pending;
    assert.doesNotMatch(host.innerHTML,/class="skeleton"/);
  });
}
