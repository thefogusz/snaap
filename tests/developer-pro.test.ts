import {test} from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import {buildApp} from '../src/api.js';

test('developer entitlement requires explicit dev option and loopback local login',async()=>{
  for(const config of [
    {local:true,developerPro:true,remoteAddress:'127.0.0.1',grant:true,status:200},
    {local:true,developerPro:false,remoteAddress:'127.0.0.1',grant:false,status:200},
    {local:false,developerPro:true,remoteAddress:'127.0.0.1',grant:false,status:404},
    {local:true,developerPro:true,remoteAddress:'192.0.2.10',grant:false,status:404},
  ]){
    const statements:{sql:string;values:any[]}[]=[];
    const query=async(sql:string,values:any[]=[])=>{statements.push({sql,values});return {rowCount:0,rows:[]};};
    const db={query,connect:async()=>({query,release(){}})} as unknown as pg.Pool;
    const {app}=await buildApp(db,{local:config.local,developerPro:config.developerPro});
    try{
      const result=await app.inject({method:'POST',url:'/api/v1/auth/local',headers:{host:'127.0.0.1:4173','x-snaap-client':'web'},remoteAddress:config.remoteAddress,payload:{}});
      assert.equal(result.statusCode,config.status,result.body);
      const grants=statements.filter(s=>s.sql.startsWith('INSERT INTO entitlements'));
      assert.equal(grants.length,config.grant?1:0);
      if(config.grant){assert.equal(grants[0].values[0],'00000000-0000-4000-8000-000000000001');assert.ok(grants[0].sql.includes('GREATEST'));}
    }finally{await app.close();}
  }
});
