import assert from 'node:assert/strict';
import test from 'node:test';
import { boundCost } from '../src/ai/budget.js';

test('five images do not reserve tokens or charge base64 bytes in the estimate', () => {
  const rate = { input: 0.25, output: 2, cap: 0.03 };
  const instructions = 'x'.repeat(40000);
  const messages = Array.from({ length: 5 }, () => ({ image_url: 'data:image/webp;base64,' + 'A'.repeat(100000) }));
  assert.equal(boundCost(instructions, messages, rate, 6000), boundCost(instructions, Array.from({ length: 5 }, () => ({ image_url: '[image]' })), rate, 6000));
  assert.ok(boundCost(instructions, messages, rate, 6000) < rate.cap);
});
