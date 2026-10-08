import {test} from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import {buildApp} from '../src/api.js';

async function appWith(){
  const query=async()=>({rowCount:0,rows:[]});
  const db={query,connect:async()=>({query,release(){}})} as unknown as pg.Pool;
  return (await buildApp(db,{})).app;
}
const host='127.0.0.1:4173';

test('large text assets are compressed and revalidated; images may be reused for a day',async()=>{
  const app=await appWith();
  try{
    const js=await app.inject({method:'GET',url:'/workbench.js',headers:{host,'accept-encoding':'br, gzip'}});
    assert.equal(js.statusCode,200);
    assert.equal(js.headers['content-encoding'],'br');
    assert.equal(js.headers['cache-control'],'no-cache');
    assert.ok(js.rawPayload.length<60_000,`compressed workbench.js was ${js.rawPayload.length} bytes`);

    const gzip=await app.inject({method:'GET',url:'/workbench.js',headers:{host,'accept-encoding':'gzip'}});
    assert.equal(gzip.headers['content-encoding'],'gzip');

    const plain=await app.inject({method:'GET',url:'/workbench.js',headers:{host,'accept-encoding':'identity'}});
    assert.equal(plain.headers['content-encoding'],undefined);

    const image=await app.inject({method:'GET',url:'/assets/snaap-social.png',headers:{host,'accept-encoding':'br, gzip'}});
    assert.equal(image.statusCode,200);
    assert.equal(image.headers['content-encoding'],undefined,'PNG is already compressed');
    assert.equal(image.headers['cache-control'],'public, max-age=86400');

    const page=await app.inject({method:'GET',url:'/home',headers:{host}});
    assert.equal(page.headers['cache-control'],'no-cache');
  }finally{await app.close();}
});
