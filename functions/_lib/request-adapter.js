import { Buffer } from 'node:buffer';

/**
 * Adapt the Web Fetch Request to the narrow IncomingMessage-like interface
 * used by the existing API handlers. Request bodies are bounded before the
 * legacy JSON parser receives them.
 */
export async function toNodeRequest(request, maxBody = 4 * 1024) {
  const headers = Object.fromEntries(request.headers.entries());
  const ip = request.headers.get('cf-connecting-ip') || '';
  const requestUrl = new URL(request.url);
  // Never trust a caller-supplied X-Forwarded-For value at the edge.
  if (ip) headers['x-forwarded-for'] = ip;
  headers['x-forwarded-proto'] = requestUrl.protocol.slice(0, -1);
  headers['x-forwarded-host'] = requestUrl.host;
  headers.host = requestUrl.host;
  const bodyChunks = [];

  if (request.body) {
    const reader = request.body.getReader();
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBody) {
          await reader.cancel('body_too_large');
          const error = new Error('body_too_large');
          error.status = 413;
          throw error;
        }
        bodyChunks.push(Buffer.from(value));
      }
    } finally {
      reader.releaseLock?.();
    }
  }

  const body = bodyChunks.length ? Buffer.concat(bodyChunks) : Buffer.alloc(0);
  const nodeRequest = {
    url: request.url,
    method: request.method,
    headers,
    socket: { remoteAddress: ip },
    on(event, callback) {
      if (event === 'data' && body.length) queueMicrotask(() => callback(body));
      if (event === 'end') queueMicrotask(() => callback());
      return this;
    },
    destroy() {},
  };

  return nodeRequest;
}

/** Collect the legacy response writer's output into a Fetch Response. */
export function createNodeResponse() {
  let status = 200;
  let headers = new Headers();
  let body = null;
  let ended = false;

  return {
    writeHead(nextStatus, nextHeaders = {}) {
      status = nextStatus;
      headers = new Headers(nextHeaders);
      return this;
    },
    end(value = '') {
      body = value === undefined || value === null ? null : String(value);
      ended = true;
      return this;
    },
    toResponse() {
      if (!ended) {
        return Response.json(
          { error: 'adapter_no_response' },
          { status: 500, headers: { 'cache-control': 'no-store' } },
        );
      }
      return new Response(body, { status, headers });
    },
  };
}
