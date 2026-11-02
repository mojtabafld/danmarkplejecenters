/**
 * Verification links are intentionally disabled in the migration preview
 * until the Fetch-native custom-auth and HTTPS mail adapters are complete.
 */
export async function onRequest() {
  return new Response(
    'Email verification is temporarily unavailable on this migration preview.',
    {
      status: 503,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
      },
    },
  );
}
