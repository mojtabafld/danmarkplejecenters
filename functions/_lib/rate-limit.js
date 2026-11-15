const AUTH_LIMITS = new Map([
  ['/api/auth/signup', { limit: 10, windowMs: 15 * 60_000 }],
  ['/api/auth/resend', { limit: 6, windowMs: 15 * 60_000 }],
  ['/api/auth/forgot', { limit: 5, windowMs: 15 * 60_000 }],
  ['/api/auth/reset', { limit: 10, windowMs: 15 * 60_000 }],
  // Sign-in includes successful requests at the edge. The existing API's
  // failure-only local throttle remains as a second layer.
  ['/api/auth/signin', { limit: 20, windowMs: 15 * 60_000 }],
]);

function hex(bytes) {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Returns a 429 Response when the shared Durable Object rejects the request,
 * otherwise null. No raw client IP is used as the Durable Object name.
 */
export async function enforceAuthRateLimit(request, env) {
  if (!env.AUTH_RATE_LIMITER || request.method !== 'POST') return null;

  const url = new URL(request.url);
  const policy = AUTH_LIMITS.get(url.pathname);
  if (!policy) return null;

  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${url.pathname}:${ip}`),
  );
  const id = env.AUTH_RATE_LIMITER.idFromName(hex(digest));
  const stub = env.AUTH_RATE_LIMITER.get(id);
  const response = await stub.fetch('https://auth-rate-limiter.internal/check', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(policy),
  });

  if (!response.ok) {
    // Fail closed: a missing or broken limiter must not silently remove the
    // distributed protection from credential endpoints.
    return Response.json(
      { error: 'rate_limiter_unavailable' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }

  const result = await response.json();
  if (result.allowed) return null;

  return Response.json(
    { error: 'too_many' },
    {
      status: 429,
      headers: {
        'cache-control': 'no-store',
        'retry-after': String(result.retryAfter ?? 60),
      },
    },
  );
}
