import test from 'node:test';
import assert from 'node:assert/strict';
import { readChatStream } from '../dist/chat-stream.js';

function response(events: unknown[], split = false) {
  const bytes = new TextEncoder().encode(events.map(event => JSON.stringify(event) + '\n').join(''));
  return new Response(new ReadableStream({ start(controller) {
    if (split) for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
    else controller.enqueue(bytes);
    controller.close();
  }}));
}
test('browser stream preserves Thai UTF-8 split across chunks and returns the saved result', async () => {
  const events: unknown[] = [];
  const result = await readChatStream(response([{ type: 'reset' }, { type: 'delta', delta: 'สวัสดีครับ' },
    { type: 'done', result: { text: 'สวัสดีครับ', draft: null } }], true), event => events.push(event));
  assert.deepEqual(events, [{ type: 'reset' }, { type: 'delta', delta: 'สวัสดีครับ' }]);
  assert.equal(result.text, 'สวัสดีครับ');
});
test('browser shows chunks before the final result arrives', async () => {
  let finish!: () => void;
  const encoder = new TextEncoder();
  const res = new Response(new ReadableStream({ start(controller) {
    controller.enqueue(encoder.encode('{"type":"delta","delta":"first"}\n'));
    finish = () => { controller.enqueue(encoder.encode('{"type":"done","result":{"text":"first"}}\n')); controller.close(); };
  }}));
  const events: unknown[] = [];
  const reading = readChatStream(res, event => { events.push(event); finish(); });
  assert.equal((await reading).text, 'first');
  assert.deepEqual(events, [{ type: 'delta', delta: 'first' }]);
});
test('browser rejects errors and disconnected streams instead of accepting partial answers', async () => {
  await assert.rejects(readChatStream(response([{ type: 'delta', delta: 'partial' }]), () => {}), /ขาดระหว่างทาง/);
  await assert.rejects(readChatStream(response([{ type: 'error', error: { message: 'คืนโควตาแล้ว' } }]), () => {}), /คืนโควตาแล้ว/);
});
