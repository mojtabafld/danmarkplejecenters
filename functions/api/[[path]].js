import * as api from '../../server/api.mjs';
import { configureRuntime, ensureDatabase } from '../_lib/runtime.js';
import { createNodeResponse, toNodeRequest } from '../_lib/request-adapter.js';

export async function onRequest({ request, env }) {
  configureRuntime(env);

  // Health remains available without a database. Stateful routes fail closed
  // through the existing API when Hyperdrive is not configured.
  if (env.HYPERDRIVE?.connectionString) {
    try {
      await ensureDatabase(env);
    } catch (error) {
      console.error('Cloudflare database initialization failed:', error?.message);
    }
  }

  let nodeRequest;
  try {
    nodeRequest = await toNodeRequest(request);
  } catch (error) {
    return Response.json(
      { error: error?.message === 'body_too_large' ? 'too_large' : 'bad_request' },
      {
        status: error?.status ?? 400,
        headers: { 'cache-control': 'no-store' },
      },
    );
  }

  const nodeResponse = createNodeResponse();
  const handled = await api.handle(nodeRequest, nodeResponse, {
    secure: new URL(request.url).protocol === 'https:',
  });

  if (!handled) {
    return Response.json(
      { error: 'not_found' },
      { status: 404, headers: { 'cache-control': 'no-store' } },
    );
  }
  return nodeResponse.toResponse();
}
