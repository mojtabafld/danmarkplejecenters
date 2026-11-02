import * as db from '../../server/db.mjs';
import * as mail from '../../server/mail.mjs';

let databaseInitialization;

/**
 * Runtime configuration is read from Cloudflare bindings. process.env is
 * populated by nodejs_compat for configured vars/secrets; Hyperdrive exposes
 * its connection string through its own binding and is copied into the name
 * the existing PostgreSQL module already understands.
 */
export function configureRuntime(env) {
  if (env.HYPERDRIVE?.connectionString) {
    process.env.DATABASE_URL ??= env.HYPERDRIVE.connectionString;
  }
  for (const key of ['PUBLIC_URL', 'ADMIN_EMAILS', 'MAIL_FROM', 'RESEND_API_KEY', 'TRAFFIC_HASH_SECRET']) {
    if (typeof env[key] === 'string' && env[key]) process.env[key] = env[key];
  }

  process.env.CLOUDFLARE_RUNTIME = '1';

  // SMTP is intentionally disabled in Pages Functions. The Node/DigitalOcean
  // deployment keeps its SMTP configuration; this branch sends through Resend
  // over HTTPS only.
  for (const key of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_URL']) {
    process.env[key] = '';
  }

  if (env.RESEND_API_KEY && env.MAIL_FROM) {
    const apiKey = env.RESEND_API_KEY;
    const from = env.MAIL_FROM;
    mail.setTransport({
      async sendMail(message) {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            from,
            to: Array.isArray(message.to) ? message.to : [message.to],
            subject: message.subject,
            text: message.text,
            html: message.html,
          }),
        });
        if (!response.ok) {
          throw new Error(`mail_provider_http_${response.status}`);
        }
        return response.json();
      },
    });
  } else {
    mail.setTransport(null);
  }
}

/** Initialize a Hyperdrive-backed pool once per isolate; never run schema DDL. */
export async function ensureDatabase(env) {
  if (!env.HYPERDRIVE?.connectionString) return false;
  if (!databaseInitialization) {
    databaseInitialization = (async () => {
      process.env.DATABASE_URL = env.HYPERDRIVE.connectionString;
      await db.init({ skipSchema: true });
      await db.query('SELECT 1');
      return true;
    })().catch(async (error) => {
      databaseInitialization = undefined;
      await db.close().catch(() => {});
      throw error;
    });
  }
  await databaseInitialization;
  return true;
}
