import * as db from '../../server/db.mjs';
import * as mail from '../../server/mail.mjs';


/**
 * Runtime configuration is read from Cloudflare bindings. process.env is
 * populated by nodejs_compat for configured vars/secrets. The Hyperdrive
 * connection string stays in its binding and is passed to a request-local client.
 */
export function configureRuntime(env) {
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

/** Hyperdrive pools origin connections; the driver client belongs to this request. */
export function withDatabase(env, handler) {
  return db.withRequestDatabase(env.HYPERDRIVE?.connectionString, handler);
}
