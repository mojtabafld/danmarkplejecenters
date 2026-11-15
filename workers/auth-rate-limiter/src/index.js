import { DurableObject } from 'cloudflare:workers';

/**
 * Strongly consistent, per-key fixed-window limiter.
 *
 * Pages Functions create one object per hashed endpoint+client key. This
 * storage-backed counter is shared across isolates and locations; unlike the
 * legacy in-memory Map, concurrent requests for one key are serialized here.
 */
export class AuthRateLimiter extends DurableObject {
  async fetch(request) {
    if (request.method !== 'POST') {
      return Response.json({ error: 'method_not_allowed' }, { status: 405 });
    }

    let input;
    try {
      input = await request.json();
    } catch {
      return Response.json({ error: 'bad_json' }, { status: 400 });
    }

    const limit = Number(input.limit);
    const windowMs = Number(input.windowMs);
    if (
      !Number.isInteger(limit) || limit < 1 || limit > 1000 ||
      !Number.isInteger(windowMs) || windowMs < 1000 || windowMs > 3600_000
    ) {
      return Response.json({ error: 'bad_config' }, { status: 400 });
    }

    const now = Date.now();
    const result = await this.ctx.storage.transaction(async (txn) => {
      const current = await txn.get('bucket');
      if (!current || now >= current.resetAt) {
        const next = { count: 1, resetAt: now + windowMs };
        await txn.put('bucket', next);
        return { allowed: true, remaining: limit - 1, resetAt: next.resetAt, alarm: true };
      }

      if (current.count >= limit) {
        return { allowed: false, remaining: 0, resetAt: current.resetAt, alarm: false };
      }

      const next = { ...current, count: current.count + 1 };
      await txn.put('bucket', next);
      return {
        allowed: true,
        remaining: Math.max(0, limit - next.count),
        resetAt: next.resetAt,
        alarm: false,
      };
    });

    if (result.alarm) await this.ctx.storage.setAlarm(result.resetAt);
    return Response.json({
      allowed: result.allowed,
      remaining: result.remaining,
      retryAfter: Math.max(0, Math.ceil((result.resetAt - now) / 1000)),
    });
  }

  async alarm() {
    await this.ctx.storage.deleteAll();
  }
}

export default {
  async fetch() {
    return new Response('Not Found', { status: 404 });
  },
};
