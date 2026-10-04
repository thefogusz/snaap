import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {localEncryptionKey} from '../scripts/local-secrets.js';
import {seal,unseal} from '../src/vault.js';
test('local encryption key persists, respects configuration and never replaces a corrupt key',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'snaap-key-test-'));const original=process.env.DATA_ENCRYPTION_KEY;
  try{
    delete process.env.DATA_ENCRYPTION_KEY;
    const key=await localEncryptionKey(root);assert.match(key,/^[a-f0-9]{64}$/);
    process.env.DATA_ENCRYPTION_KEY=key;const sealed=seal({secret:'fixture'},'owner:connection');
    delete process.env.DATA_ENCRYPTION_KEY;
    const restarted=await localEncryptionKey(root);assert.equal(restarted,key);
    process.env.DATA_ENCRYPTION_KEY=restarted;assert.deepEqual(unseal(sealed,'owner:connection'),{secret:'fixture'});
    process.env.DATA_ENCRYPTION_KEY='b'.repeat(64);assert.equal(await localEncryptionKey(root),'b'.repeat(64));assert.equal(await readFile(path.join(root,'data-encryption.key'),'utf8'),key);
    process.env.DATA_ENCRYPTION_KEY='invalid';await assert.rejects(localEncryptionKey(root),/Invalid DATA_ENCRYPTION_KEY/);
    delete process.env.DATA_ENCRYPTION_KEY;await writeFile(path.join(root,'data-encryption.key'),'corrupt');await assert.rejects(localEncryptionKey(root),/preserve/);
    assert.equal(await readFile(path.join(root,'data-encryption.key'),'utf8'),'corrupt');
  }finally{
    if(original===undefined)delete process.env.DATA_ENCRYPTION_KEY;else process.env.DATA_ENCRYPTION_KEY=original;
    if(path.dirname(path.resolve(root))!==path.resolve(tmpdir()) || !path.basename(root).startsWith('snaap-key-test-'))throw new Error('Unexpected test cleanup path');
    await rm(root,{recursive:true,force:true});
  }
});
