import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../dist/workbench.js',import.meta.url),'utf8');
const loadingUI=await readFile(new URL('../dist/loading-ui.js',import.meta.url),'utf8');
const start=source.indexOf('let historyRenderVersion=0;');
const end=source.indexOf('document.addEventListener("submit",',start);
assert.ok(start >= 0 && end > start);

function fixture(api: (url:string,method?:string,body?:unknown,options?:{signal:AbortSignal})=>Promise<unknown>, signals:unknown=AbortSignal) {
  const element=()=>({innerHTML:'',textContent:'',className:'',dataset:{},children:[],childNodes:[],tagName:'DIV',
    append(){},before(){},after(){},setAttribute(){},closest(){return null;},remove(){},
    removeAttribute(){},replaceChildren(){},querySelector(){return element();},querySelectorAll(){return [];}});
  const view=element(),upload=element();
  const created:ReturnType<typeof element>[]=[];
  const rendered:string[]=[];
  const context=vm.createContext({api,AbortSignal:signals,AbortController,state:{workspaceId:'test-workspace'},scheduleHistorySyncRefresh:()=>{},document:{createElement:()=>{
    const node=element();created.push(node);return node;
  }},
    $:(selector:string)=>selector==='#view-history'?view:upload,
    esc:(value:unknown)=>String(value),uiIcon:()=>'',toast:()=>{},
    renderConnections:async()=>{rendered.push('connections');},
    renderTradingLab:async()=>{rendered.push('images');},
  });
  vm.runInContext(loadingUI+'\n'+source.slice(start,end)+';globalThis.render=renderHistory;',context);
  return {view,created,render:context.render as ()=>Promise<void>,rendered};
}

test('history shows a stable loading heading and starts independent reads together',async()=>{
  const calls:string[]=[];
  const page=fixture(async url=>{calls.push(url);return new Promise(()=>{});});
  void page.render();
  assert.match(page.view.innerHTML,/ข้อมูลของฉัน/);
  assert.match(page.view.innerHTML,/skeleton-history/);
  assert.deepEqual(calls.sort(),['/connections','/images','/imports']);
});

test('an imports failure does not leave the page stuck loading or hide other sections',async()=>{
  const page=fixture(async url=>{
    if(url==='/imports')throw Error('offline');
    return url==='/connections'?{items:[],supported:[],enabled:false}:[];
  });
  await page.render();
  assert.ok(page.created.some(node=>/history-upload/.test(node.innerHTML)));
  assert.ok(page.rendered.includes('connections'));
  assert.ok(page.rendered.includes('images'));
  assert.ok(page.created.some(node=>/ประวัติที่นำเข้า.*ยังโหลดข้อมูลส่วนนี้ไม่ได้/.test(node.innerHTML)));
});

test('old history responses cannot render into a newer workspace view',async()=>{
  const pending:Array<()=>void>=[];
  const page=fixture(url=>new Promise(resolve=>pending.push(()=>resolve(url==='/connections'?{items:[]}:[]))));
  const first=page.render(),second=page.render();
  pending.slice(0,3).forEach(resolve=>resolve());
  await first;
  assert.deepEqual(page.rendered,[]);
  pending.slice(3).forEach(resolve=>resolve());
  await second;
  assert.deepEqual(page.rendered.sort(),['connections','images']);
});

test('a hanging read stops loading at the deadline while other sections remain available',async()=>{
  const deadline=new AbortController();
  const page=fixture(async(url,_method,_body,options)=>{
    if(url!=='/imports')return url==='/connections'?{items:[]}:[];
    return new Promise((_resolve,reject)=>{
      options!.signal.addEventListener('abort',()=>reject(options!.signal.reason),{once:true});
    });
  },{any:AbortSignal.any,timeout:()=>deadline.signal});
  const loading=page.render();
  deadline.abort();
  await loading;
  assert.deepEqual(page.rendered.sort(),['connections','images']);
  assert.ok(page.created.some(node=>/ประวัติที่นำเข้า.*ยังโหลดข้อมูลส่วนนี้ไม่ได้/.test(node.innerHTML)));
});
