import test from 'node:test';
import assert from 'node:assert/strict';
import OpenAI from 'openai';
import { createProviderResponse, ProviderFailure } from '../src/ai/provider.js';

function fixture(replies: unknown[]) {
  let calls = 0;
  const client = new OpenAI({ apiKey: 'fixture', maxRetries: 0, fetch: async () => {
    const body = replies[Math.min(calls++, replies.length - 1)];
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json', 'x-request-id': 'fixture-request' } });
  }});
  return { client, calls: () => calls };
}
const success = { id: 'resp_fixture', status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'done' }] }] };
test('SDK response transform reproduces the hidden HTTP 200 error', async () => {
  const f = fixture([{ object: 'response', error: { code: 400 } }]);
  await assert.rejects(f.client.responses.create({ model: 'fixture', input: 'hi' }), TypeError);
});
test('HTTP 200 error body is preserved instead of crashing SDK output parsing', async () => {
  const f = fixture([{ error: { code: 400, message: 'secret user text', param: 'reasoning' } }]);
  await assert.rejects(createProviderResponse(f.client, { model: 'fixture', input: 'hi' }, AbortSignal.timeout(5000), []), (e: unknown) => {
    assert.ok(e instanceof ProviderFailure); assert.equal(e.status, 400);
    assert.equal(e.param, 'reasoning'); assert.ok(!JSON.stringify(e).includes('secret user text')); return true;
  });
  assert.equal(f.calls(), 1);
});
test('transient 200 error retries once and normalizes output_text', async () => {
  const f = fixture([{ error: { code: 503 } }, success]); const trace: unknown[] = [];
  const r = await createProviderResponse(f.client, { model: 'fixture', input: 'hi' }, AbortSignal.timeout(5000), trace);
  assert.equal(r.output_text, 'done'); assert.equal(f.calls(), 2); assert.equal(trace.length, 1);
});
test('malformed 200 output and exhausted transient errors never count as success', async () => {
  for (const body of [{ status: 'completed' }, { error: { code: 429 } }]) {
    const f = fixture([body]);
    await assert.rejects(createProviderResponse(f.client, { model: 'fixture', input: 'hi' }, AbortSignal.timeout(5000), []), ProviderFailure);
    assert.ok(f.calls() <= 2);
  }
});
test('incomplete response stays incomplete and tool calls remain intact', async () => {
  const body = { id: 'resp_tool', status: 'incomplete', output: [{ type: 'function_call', call_id: 'call_1', name: 'propose_strategy', arguments: '{}' }] };
  const f = fixture([body]); const r = await createProviderResponse(f.client, { model: 'fixture', input: 'hi' }, AbortSignal.timeout(5000), []);
  assert.equal(r.status, 'incomplete'); assert.deepEqual(r.output, body.output); assert.equal(f.calls(), 1);
});
test('partially charged failures do not retry and keep usage for refund accounting', async () => {
  const f = fixture([{ error: { code: '503' }, usage: { input_tokens: 100, output_tokens: 40 } }, success]);
  const trace: unknown[] = [];
  await assert.rejects(createProviderResponse(f.client, { model: 'fixture', input: 'hi' }, AbortSignal.timeout(5000), trace), ProviderFailure);
  assert.equal(f.calls(), 1); assert.deepEqual(trace[0], { inputTokens: 100, outputTokens: 40 });
});

function streamingFixture(events: unknown[]) {
  let calls = 0;
  const client = new OpenAI({ apiKey: 'fixture', maxRetries: 0, fetch: async (_url, init) => {
    calls++;
    assert.equal(JSON.parse(init!.body as string).stream, true);
    return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''),
      { headers: { 'content-type': 'text/event-stream' } });
  }});
  return { client, calls: () => calls };
}
test('provider forwards real text deltas and preserves terminal tool calls and usage', async () => {
  const terminal = { ...success, usage: { input_tokens: 100, output_tokens: 40 },
    output: [...success.output, { type: 'function_call', name: 'read_skill', arguments: '{}', call_id: 'one' }] };
  const f = streamingFixture([
    { type: 'response.output_text.delta', delta: 'สวัสดี' },
    { type: 'response.output_text.delta', delta: 'ครับ' },
    { type: 'response.completed', response: terminal },
  ]);
  const deltas: string[] = [];
  const result = await createProviderResponse(f.client, { model: 'fixture', input: 'hi' }, AbortSignal.timeout(5000), [], delta => deltas.push(delta));
  assert.deepEqual(deltas, ['สวัสดี', 'ครับ']);
  assert.deepEqual(result.output, terminal.output); assert.deepEqual(result.usage, terminal.usage);
});
test('broken streams and failures after generation never retry or expose provider messages', async () => {
  for (const ending of [[], [{ type: 'error', code: 'server_error', message: 'secret' }],
    [{ type: 'response.failed', response: { error: { code: 503, message: 'secret' }, usage: { input_tokens: 10, output_tokens: 5 } } }]]) {
    const f = streamingFixture([{ type: 'response.output_text.delta', delta: 'partial' }, ...ending]);
    await assert.rejects(createProviderResponse(f.client, { model: 'fixture', input: 'hi' }, AbortSignal.timeout(5000), [], () => {}), (e: unknown) => {
      assert.ok(e instanceof ProviderFailure); assert.ok(!e.message.includes('secret')); return true;
    });
    assert.equal(f.calls(), 1);
  }
});
