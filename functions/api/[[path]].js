/**
 * Cloudflare Pages Functions migration boundary.
 *
 * This deliberately exposes only a health endpoint. All stateful API routes
 * fail closed until the Fetch-native handlers, custom-auth runtime, shared
 * rate limiter, mail provider, and a staging-only Hyperdrive binding have
 * passed their tests. Do not attach production credentials to this branch.
 */
export async function onRequest({ request }) {
  const url = new URL(request.url);

  if (url.pathname === '/api/health' && request.method === 'GET') {
    return Response.json(
      {
        runtime: 'cloudflare-pages-functions',
        migration: 'scaffold',
        database: 'not_connected',
        mail: 'not_connected',
        api: 'disabled_until_port_complete',
      },
      {
        status: 200,
        headers: { 'cache-control': 'no-store' },
      },
    );
  }

  return Response.json(
    {
      error: 'migration_incomplete',
      message: 'This preview does not serve account or user-data API routes yet.',
    },
    {
      status: 503,
      headers: { 'cache-control': 'no-store' },
    },
  );
}
