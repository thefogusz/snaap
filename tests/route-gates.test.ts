import {test} from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import {buildApp} from '../src/api.js';

const userId='00000000-0000-4000-8000-0000000000aa';

async function appWith(sessionUser:string|undefined){
  const statements:string[]=[];
  const query=async(sql:string)=>{
    statements.push(sql);
    if(sql.includes('FROM sessions')) return sessionUser?{rowCount:1,rows:[{user_id:sessionUser}]}:{rowCount:0,rows:[]};
    if(sql.startsWith('SELECT id, email, google_sub, role')) return {rowCount:1,rows:[{id:userId,email:'member@example.com',google_sub:'sub',role:'user'}]};
    return {rowCount:0,rows:[]};
  };
  const db={query,connect:async()=>({query,release(){}})} as unknown as pg.Pool;
  const {app}=await buildApp(db,{});
  return {app,statements};
}

const headers={host:'127.0.0.1:4173'};

test('percent-encoded API paths still require a session before reaching a route',async()=>{
  const {app,statements}=await appWith(undefined);
  try{
    for(const url of ['/%61pi/v1/admin/users','/api/v1/%61dmin/overview','/%61pi/v1/workspaces']){
      const result=await app.inject({method:'GET',url,headers});
      assert.equal(result.statusCode,401,`${url}: ${result.body}`);
    }
    assert.deepEqual(statements.filter(sql=>/\bFROM users\b/.test(sql)),[],'no user or admin data was read');
  }finally{await app.close();}
});

test('percent-encoded admin paths still require the admin identity',async()=>{
  const {app}=await appWith(userId);
  try{
    for(const url of ['/api/v1/%61dmin/users','/api/v1/%61dmin/overview','/api/v1/admin%2Fusers']){
      const result=await app.inject({method:'GET',url,headers,cookies:{snaap_session:'t'.repeat(64)}});
      assert.ok([403,404].includes(result.statusCode),`${url}: ${result.statusCode} ${result.body}`);
    }
    const plain=await app.inject({method:'GET',url:'/api/v1/admin/users',headers,cookies:{snaap_session:'t'.repeat(64)}});
    assert.equal(plain.statusCode,403,plain.body);
  }finally{await app.close();}
});

async function withProxyHops<T>(work:()=>Promise<T>){
  const saved=process.env.TRUST_PROXY_HOPS;
  process.env.TRUST_PROXY_HOPS='1';
  try{return await work();}finally{if(saved===undefined)delete process.env.TRUST_PROXY_HOPS;else process.env.TRUST_PROXY_HOPS=saved;}
}

test('behind a trusted proxy each client gets its own login limit and provider hooks are not throttled',async()=>{
  await withProxyHops(async()=>{
    const {app}=await appWith(undefined);
    try{
      const start=(client:string)=>app.inject({method:'GET',url:'/api/v1/auth/google',headers:{...headers,'x-forwarded-for':client},remoteAddress:'10.0.0.2'});
      for(let i=0;i<20;i++) assert.notEqual((await start('198.51.100.7')).statusCode,429);
      assert.equal((await start('198.51.100.7')).statusCode,429);
      assert.notEqual((await start('198.51.100.8')).statusCode,429,'another client behind the same proxy is unaffected');
      for(let i=0;i<200;i++){
        const hook=await app.inject({method:'POST',url:'/api/v1/hooks/line',headers:{...headers,'content-type':'application/json'},payload:'{}',remoteAddress:'10.0.0.2'});
        assert.notEqual(hook.statusCode,429,`hook request ${i}`);
      }
    }finally{await app.close();}
  });
});

test('a forwarded header cannot claim loopback for local login',async()=>{
  await withProxyHops(async()=>{
    const query=async()=>({rowCount:0,rows:[]});
    const db={query,connect:async()=>({query,release(){}})} as unknown as pg.Pool;
    const {app}=await buildApp(db,{local:true});
    try{
      const result=await app.inject({method:'POST',url:'/api/v1/auth/local',headers:{...headers,'x-snaap-client':'web','x-forwarded-for':'127.0.0.1'},remoteAddress:'192.0.2.10',payload:{}});
      assert.equal(result.statusCode,404,result.body);
    }finally{await app.close();}
  });
});

test('on Railway rate limits key on the edge X-Real-IP header and ignore invalid values',async()=>{
  const saved={project:process.env.RAILWAY_PROJECT_ID,hops:process.env.TRUST_PROXY_HOPS,header:process.env.CLIENT_IP_HEADER};
  process.env.RAILWAY_PROJECT_ID='test-project';
  delete process.env.TRUST_PROXY_HOPS;delete process.env.CLIENT_IP_HEADER;
  try{
    const {app}=await appWith(undefined);
    try{
      const start=(realIp:string)=>app.inject({method:'GET',url:'/api/v1/auth/google',headers:{...headers,'x-real-ip':realIp,'x-forwarded-for':`${realIp}, fd12::${Math.floor(Math.random()*9)}`},remoteAddress:'fd12::1'});
      for(let i=0;i<20;i++) assert.notEqual((await start('198.51.100.7')).statusCode,429,`request ${i}`);
      assert.equal((await start('198.51.100.7')).statusCode,429,'varying internal hops do not split one client');
      assert.notEqual((await start('198.51.100.8')).statusCode,429,'another client has its own bucket');
      const bogus=await app.inject({method:'GET',url:'/api/v1/auth/google',headers:{...headers,'x-real-ip':'not-an-ip'},remoteAddress:'198.51.100.7'});
      assert.equal(bogus.statusCode,429,'an invalid header falls back to the socket address');
    }finally{await app.close();}
  }finally{
    for(const [key,value] of [['RAILWAY_PROJECT_ID',saved.project],['TRUST_PROXY_HOPS',saved.hops],['CLIENT_IP_HEADER',saved.header]] as const)
      if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
});
