import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerConversationRemoval } from '../src/conversation-removal.js';
const {createConversationCache} = await import(new URL('../dist/conversation-cache.js', import.meta.url).href);

test('deleted conversation cannot return through a stale list response', async () => {
  let resolve: (rows: any[]) => void;
  const cache = createConversationCache({scope: () => ({owner: 'one', workspace: 'space'}), load: () => new Promise<any[]>(done => {resolve = done;})});
  cache.upsert({id: 'deleted', title: 'Deleted'});
  const pending = cache.list({force: true});
  cache.remove('deleted');
  resolve!([{id: 'deleted', title: 'Deleted'}]);
  assert.deepEqual(await pending, []);
});

for (const scenario of ['missing', 'running', 'success', 'failure']) test(`conversation deletion: ${scenario}`, async () => {
  const queries: string[] = [];
  const id = '00000000-0000-4000-8000-000000000001';
  const client = {release() {}, async query(sql: string, params?: any[]) {
    queries.push(sql);
    if (sql.startsWith('SELECT id,saved_rule_id')) {
      assert.deepEqual(params, [id, 'owner', 'space']);
      return {rows: scenario === 'missing' ? [] : [{id, saved_rule_id: id}], rowCount: scenario === 'missing' ? 0 : 1};
    }
    if (sql.startsWith('SELECT 1 FROM agent_runs')) return {rowCount: scenario === 'running' ? 1 : 0, rows: []};
    if (sql.startsWith('UPDATE rules')) return {rows: [{id}], rowCount: 1};
    if (scenario === 'failure' && sql.startsWith('DELETE FROM messages')) throw new Error('fixture failure');
    return {rows: [], rowCount: 1};
  }};
  const app = Fastify();
  app.decorateRequest('userId', 'owner'); app.decorateRequest('workspaceId', 'space');
  app.setErrorHandler((err, _req, reply) => reply.code((err as any).statusCode ?? 500).send({error: 'fixture'}));
  registerConversationRemoval(app, {connect: async () => client} as any);
  try {
    const result = await app.inject({method: 'DELETE', url: `/api/v1/conversations/${id}`});
    assert.equal(result.statusCode, scenario === 'success' ? 200 : scenario === 'missing' ? 404 : scenario === 'running' ? 409 : 500);
    assert.equal(queries.at(-1), scenario === 'success' ? 'COMMIT' : 'ROLLBACK');
    if (scenario === 'success') {
      assert.deepEqual(result.json().ruleIds, [id]);
      assert.ok(queries.some(sql => sql.includes("status='CANCELLED'")));
      assert.ok(queries.some(sql => sql.startsWith('DELETE FROM conversations')));
    } else if (scenario !== 'failure') assert.ok(!queries.some(sql => sql.startsWith('UPDATE rules')));
  } finally {await app.close();}
});
