/**
 * Sending the verification message.
 *
 * Configured entirely from the environment, so no provider is baked in and no
 * credential is ever in the repository:
 *
 *   SMTP_URL   smtps://user:pass@smtp.example.com:465   (set as a SECRET)
 *   MAIL_FROM  Plejecentre <no-reply@example.com>
 *
 * Without SMTP_URL the module reports itself unconfigured and sign-up refuses
 * rather than creating accounts that can never be confirmed.
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
  return overridden || Boolean(process.env.SMTP_URL);
}

function mailer() {
  if (!transport) {
    transport = nodemailer.createTransport(process.env.SMTP_URL, {
      // A slow or dead mail host must not hold a web request open.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }
  return transport;
}

const FROM = () => process.env.MAIL_FROM ?? 'no-reply@localhost';

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

/** For the start-up log, so a misconfiguration is visible before anyone tries. */
export async function check() {
  if (overridden) return 'mail transport injected';
  if (!isConfigured()) return 'SMTP_URL not set, sign-up disabled';
  try {
    await mailer().verify();
    return 'mail ready';
  } catch (err) {
    return `mail configured but not reachable: ${err.message}`;
  }
}
