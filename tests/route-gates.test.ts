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
