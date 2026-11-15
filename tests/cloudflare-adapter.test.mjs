import assert from 'node:assert/strict';
import { toNodeRequest, createNodeResponse } from '../functions/_lib/request-adapter.js';
import { configureRuntime } from '../functions/_lib/runtime.js';
import { enforceAuthRateLimit } from '../functions/_lib/rate-limit.js';
import * as mail from '../server/mail.mjs';

const request = new Request('https://preview.example/api/auth/signin', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'cf-connecting-ip': '203.0.113.9',
    'x-forwarded-for': '198.51.100.99',
  },
  body: JSON.stringify({ email: 'test@example.dk', password: 'correct-horse' }),
});

const adapted = await toNodeRequest(request);
assert.equal(adapted.method, 'POST');
assert.equal(adapted.headers['x-forwarded-for'], '203.0.113.9');
assert.equal(adapted.headers['x-forwarded-proto'], 'https');
assert.equal(adapted.headers['x-forwarded-host'], 'preview.example');

const body = await new Promise((resolve, reject) => {
  const chunks = [];
  adapted.on('data', (chunk) => chunks.push(chunk));
  adapted.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  adapted.on('error', reject);
});
assert.deepEqual(JSON.parse(body), { email: 'test@example.dk', password: 'correct-horse' });

await assert.rejects(
  () => toNodeRequest(new Request('https://preview.example/api', {
    method: 'POST',
    body: 'x'.repeat(4097),
  })),
  (error) => error.message === 'body_too_large' && error.status === 413,
);

const writer = createNodeResponse();
writer.writeHead(303, { location: '/?verified=1', 'cache-control': 'no-store' });
writer.end();
const response = writer.toResponse();
assert.equal(response.status, 303);
assert.equal(response.headers.get('location'), '/?verified=1');
assert.equal(response.headers.get('cache-control'), 'no-store');

console.log('Cloudflare request/response adapter tests passed');

const originalFetch = globalThis.fetch;
const sent = [];
globalThis.fetch = async (url, init) => {
  sent.push({ url, init, body: JSON.parse(init.body) });
  return new Response(JSON.stringify({ id: 'mail_test_id' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};

configureRuntime({
  RESEND_API_KEY: 'test-key-not-a-real-secret',
  MAIL_FROM: 'Plejecentre <noreply@example.test>',
  TRAFFIC_HASH_SECRET: 'test-traffic-secret',
});
await mail.sendVerification('reader@example.test', 'https://preview.example/verify?token=abc');
await mail.sendReset('reader@example.test', 'https://preview.example/?reset=def');

assert.equal(sent.length, 2);
assert.equal(sent[0].url, 'https://api.resend.com/emails');
assert.equal(sent[0].init.headers.authorization, 'Bearer test-key-not-a-real-secret');
assert.deepEqual(sent[0].body.to, ['reader@example.test']);
assert.equal(sent[0].body.from, 'Plejecentre <noreply@example.test>');
assert.match(sent[0].body.text, /https:\/\/preview\.example\/verify\?token=abc/);
assert.match(sent[1].body.text, /https:\/\/preview\.example\/\?reset=def/);

globalThis.fetch = originalFetch;
mail.setTransport(null);
console.log('Cloudflare HTTPS mail adapter tests passed');

let limiterName = '';
const blocked = await enforceAuthRateLimit(
  new Request('https://preview.example/api/auth/signin', {
    method: 'POST',
    headers: { 'cf-connecting-ip': '203.0.113.44' },
  }),
  {
    AUTH_RATE_LIMITER: {
      idFromName(name) { limiterName = name; return name; },
      get(id) {
        assert.equal(id, limiterName);
        return {
          async fetch() {
            return Response.json({ allowed: false, retryAfter: 37 });
          },
        };
      },
    },
  },
);
assert.equal(blocked.status, 429);
assert.equal(blocked.headers.get('retry-after'), '37');
assert.equal(limiterName.length, 64, 'DO identity is a SHA-256 digest, not a raw IP');

const allowed = await enforceAuthRateLimit(
  new Request('https://preview.example/api/auth/signin', { method: 'POST' }),
  {
    AUTH_RATE_LIMITER: {
      idFromName(name) { return name; },
      get() {
        return { async fetch() { return Response.json({ allowed: true, remaining: 19 }); } };
      },
    },
  },
);
assert.equal(allowed, null);
assert.equal(
  await enforceAuthRateLimit(new Request('https://preview.example/api/auth/me'), {}),
  null,
);

console.log('Cloudflare Durable Object rate-limit adapter tests passed');
