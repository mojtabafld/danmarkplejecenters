/**
 * Sending the verification message.
 *
 * Configured entirely from the environment, so no provider is baked in and no
 * credential is ever in the repository. Two forms, discrete first:
 *
 *   SMTP_HOST  smtp.simply.com
 *   SMTP_PORT  587
 *   SMTP_USER  no-reply@example.com
 *   SMTP_PASS  the mailbox password        (set as a SECRET)
 *
 *   SMTP_URL   smtp://user:pass@host:587   (set as a SECRET)
 *
 * The discrete form exists because a password is not URL-safe. An @, a : or a
 * / in it silently truncates the connection string and the failure looks like
 * a wrong host. With the discrete variables nothing needs encoding.
 *
 *   MAIL_FROM  Plejecentre <no-reply@example.com>
 *
 * Without either form the module reports itself unconfigured and sign-up
 * refuses rather than creating accounts that can never be confirmed.
 */
import nodemailer from 'nodemailer';

let transport = null;
let overridden = false;

/**
 * Swap the transport. The tests inject one that captures messages instead of
 * sending them, which is the only way to assert on the link without a mail
 * server. Nothing in the application calls this.
 */
export function setTransport(t) {
  transport = t;
  overridden = t !== null;
}

export function isConfigured() {
  return overridden || Boolean(process.env.SMTP_URL || (process.env.SMTP_HOST && process.env.SMTP_USER));
}

/**
 * Build the transport options.
 *
 * `requireTLS` is the part that matters on port 587. Without it nodemailer
 * upgrades to STARTTLS only if the server offers it, and quietly sends the
 * password in the clear if something between here and there strips the
 * offer. With it, the connection fails instead -- which is the right outcome.
 */
function options() {
  const common = {
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  };

  if (process.env.SMTP_HOST) {
    const port = Number(process.env.SMTP_PORT) || 587;
    // 465 is implicit TLS; everything else negotiates upward and must.
    const secure = process.env.SMTP_SECURE === '1' || port === 465;
    return {
      ...common,
      host: process.env.SMTP_HOST,
      port,
      secure,
      requireTLS: !secure,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? '' },
    };
  }

  const url = process.env.SMTP_URL ?? '';
  return [url, { ...common, requireTLS: !url.startsWith('smtps:') }];
}

function mailer() {
  if (!transport) {
    const opts = options();
    // A slow or dead mail host must not hold a web request open, which is what
    // the timeouts in options() are for.
    transport = Array.isArray(opts)
      ? nodemailer.createTransport(opts[0], opts[1])
      : nodemailer.createTransport(opts);
  }
  return transport;
}

// Falls back to the authenticating mailbox: most providers refuse to send as
// an address the account does not own, so that is the safest default.
const FROM = () => process.env.MAIL_FROM ?? process.env.SMTP_USER ?? 'no-reply@localhost';

/**
 * One message, in all three languages, because the server does not know which
 * one the reader was using and guessing wrong is worse than showing all three.
 * Plain text alongside HTML so it stays readable in any client.
 */
function body(url) {
  const text = [
    'Bekræft din e-mailadresse for at fuldføre oprettelsen:',
    'Confirm your email address to finish creating your account:',
    'برای کامل شدن ساخت حساب، نشانی ایمیل خود را تأیید کنید:',
    '',
    url,
    '',
    'Linket udløber om 24 timer. / The link expires in 24 hours. / این پیوند تا ۲۴ ساعت معتبر است.',
    'Hvis du ikke har oprettet en konto, kan du se bort fra denne mail.',
    'If you did not create an account, you can ignore this message.',
    'اگر شما حساب نساخته‌اید، این پیام را نادیده بگیرید.',
  ].join('\n');

  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const html =
    `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:16px;line-height:1.5;color:#1E2121">` +
    `<p>Bekræft din e-mailadresse for at fuldføre oprettelsen:</p>` +
    `<p>Confirm your email address to finish creating your account:</p>` +
    `<p dir="rtl">برای کامل شدن ساخت حساب، نشانی ایمیل خود را تأیید کنید:</p>` +
    `<p style="margin:24px 0"><a href="${esc(url)}" ` +
    `style="display:inline-block;padding:12px 20px;background:#006D63;color:#fff;` +
    `text-decoration:none;border-radius:10px">Bekræft / Confirm / تأیید</a></p>` +
    `<p style="font-size:13px;color:#575F5F">${esc(url)}</p>` +
    `<p style="font-size:13px;color:#575F5F">Linket udløber om 24 timer. ` +
    `The link expires in 24 hours. <span dir="rtl">این پیوند تا ۲۴ ساعت معتبر است.</span></p>` +
    `<p style="font-size:13px;color:#575F5F">Hvis du ikke har oprettet en konto, kan du se bort fra denne mail. ` +
    `If you did not create an account, you can ignore this message.</p>` +
    `</div>`;
  return { text, html };
}

export async function sendVerification(to, url) {
  const { text, html } = body(url);
  await mailer().sendMail({
    from: FROM(),
    to,
    subject: 'Bekræft din e-mail / Confirm your email / تأیید ایمیل',
    text,
    html,
  });
}

/**
 * Which of the expected variables the process can actually see.
 *
 * Names only, never values: this exists to answer "did the platform pass them
 * through, and under the names the code reads" without putting a password in
 * an endpoint anyone can call. An empty string counts as absent, because that
 * is what an unfilled placeholder in the app spec leaves behind.
 */
export function configuredVars() {
  const names = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_URL', 'MAIL_FROM'];
  return names.filter((n) => (process.env[n] ?? '').trim() !== '');
}

/** For the start-up log, so a misconfiguration is visible before anyone tries. */
export async function check() {
  if (overridden) return 'mail transport injected';
  if (!isConfigured()) return 'mail not configured (set SMTP_HOST/SMTP_USER/SMTP_PASS), sign-up disabled';
  try {
    await mailer().verify();
    return `mail ready via ${process.env.SMTP_HOST ?? 'SMTP_URL'} as ${FROM()}`;
  } catch (err) {
    // The message names the host and the failure, never the password.
    return `mail configured but not usable: ${err.message}`;
  }
}
