// Node.js 22+. Run behind your HTTPS reverse proxy; no dependency installation needed.
// SNAAP_WEBHOOK_SECRET is the one-time secret shown when connecting your endpoint.
import { createServer } from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';

const processed = new Set(); // Replace with a durable unique signal-ID table in production.
function matches(a, b) {
  return typeof a === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
createServer(async (request, response) => {
  const reply = (status, text) => { response.writeHead(status, {'Content-Type':'text/plain'}); response.end(text); };
  if (request.method !== 'POST' || request.url !== '/snaap') return reply(404, 'Not found');
  try {
    const chunks = []; let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 65536) return reply(413, 'Too large');
      chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks);
    const body = JSON.parse(raw.toString('utf8'));
    if (body.type === 'snaap.verify' && /^[a-f0-9]{48}$/.test(body.challenge)) return reply(200, body.challenge);
    const secret = process.env.SNAAP_WEBHOOK_SECRET;
    if (!secret) return reply(503, 'Set SNAAP_WEBHOOK_SECRET first');
    const timestamp = request.headers['x-snaap-timestamp'];
    if (typeof timestamp !== 'string' || !/^\d{10}$/.test(timestamp) || Math.abs(Date.now()/1000 - Number(timestamp)) > 300) return reply(401, 'Expired timestamp');
    const expected = createHmac('sha256', secret).update(timestamp + '.').update(raw).digest('hex');
    if (!matches(request.headers['x-snaap-signature-v1'], expected)) return reply(401, 'Invalid signature');
    if (body.type !== 'snaap.signal' || typeof body.id !== 'string' || body.id !== request.headers['x-snaap-id']) return reply(400, 'Invalid event');
    if (processed.has(body.id)) return reply(200, 'Already accepted');
    if (processed.size >= 10000) return reply(503, 'Demo capacity reached; use durable storage');
    // Persist the event with a UNIQUE(id) constraint before acknowledging in production.
    processed.add(body.id);
    console.log(body.test ? 'TEST' : 'SIGNAL', body.id, body.pair, body.event?.kind);
    return reply(200, 'Accepted');
  } catch { return reply(400, 'Invalid request'); }
}).listen(Number(process.env.PORT || 4185), '127.0.0.1', () => console.log('Receiver on 127.0.0.1; expose /snaap through your HTTPS proxy.'));
