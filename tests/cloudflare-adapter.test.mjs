import assert from 'node:assert/strict';
import { toNodeRequest, createNodeResponse } from '../functions/_lib/request-adapter.js';

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
