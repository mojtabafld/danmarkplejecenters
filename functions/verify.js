import * as api from '../server/api.mjs';
import { configureRuntime, ensureDatabase } from './_lib/runtime.js';
import { createNodeResponse, toNodeRequest } from './_lib/request-adapter.js';

export async function onRequest({ request, env }) {
  configureRuntime(env);
  if (env.HYPERDRIVE?.connectionString) {
    try {
      await ensureDatabase(env);
    } catch (error) {
      console.error('Cloudflare database initialization failed:', error?.message);
    }
  }

  const nodeRequest = await toNodeRequest(request);
  const nodeResponse = createNodeResponse();
  await api.handle(nodeRequest, nodeResponse, {
    secure: new URL(request.url).protocol === 'https:',
  });
  return nodeResponse.toResponse();
}
