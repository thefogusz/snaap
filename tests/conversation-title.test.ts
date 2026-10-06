import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {z} from 'zod';

const source = await readFile(new URL('../src/api.ts', import.meta.url), 'utf8');
const route = source.slice(source.indexOf('  app.put("/api/v1/conversations/:id/title"'), source.indexOf('  app.get("/api/v1/conversations/:id/messages"'));
const id = '00000000-0000-4000-8000-000000000001';
function fixture() {
  let title = 'Original';
  let queries = 0;
  let handler: (req: any) => Promise<any>;
  const context = vm.createContext({
    z,
    ApiError: class extends Error { constructor(public statusCode: number, public code: string, message: string) {super(message);} },
    app: {put(_path: string, callback: typeof handler) {handler = callback;}},
    db: {async query(sql: string, values: any[]) {
      queries++;
      assert.match(sql, /owner_id=\$3/);
      assert.match(sql, /\(\$4::uuid IS NULL OR workspace_id=\$4\)/);
      assert.equal(values[1], id);
      if (values[2] !== 'owner' || (values[3] !== null && values[3] !== 'workspace')) return {rows: []};
      title = values[0];
      return {rows: [{id, title}]};
    }},
  });
  vm.runInContext(route, context);
  return {rename: (body: any, userId = 'owner', workspaceId: string | null = 'workspace') => handler({params: {id}, body, userId, workspaceId}), title: () => title, queries: () => queries};
}
test('renaming stores trimmed text without changing other conversation fields', async () => {
  const f = fixture();
  assert.equal((await f.rename({title: '  แผน EMA <Long>  '})).title, 'แผน EMA <Long>');
  assert.equal(f.title(), 'แผน EMA <Long>');
});
test('renaming rejects blank, oversized and unexpected fields before querying', async () => {
  const f = fixture();
  for (const body of [{title: '   '}, {title: 'x'.repeat(101)}, {title: 'Valid', owner_id: 'other'}]) {
    await assert.rejects(f.rename(body));
  }
  assert.equal(f.queries(), 0);
  assert.equal(f.title(), 'Original');
});
test('another owner or workspace cannot rename the conversation', async () => {
  const f = fixture();
  await assert.rejects(f.rename({title: 'Changed'}, 'other'), {statusCode: 404});
  await assert.rejects(f.rename({title: 'Changed'}, 'owner', 'other-workspace'), {statusCode: 404});
  assert.equal(f.title(), 'Original');
});
