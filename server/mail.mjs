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
  return overridden || Boolean((process.env.RESEND_API_KEY && process.env.MAIL_FROM) || process.env.SMTP_URL || (process.env.SMTP_HOST && process.env.SMTP_USER));
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

async function mailer() {
  if (!transport) {
    // Loaded only by the traditional Node deployment. Cloudflare injects an
    // HTTPS transport before any API handler can send mail, so Nodemailer and
    // its raw SMTP sockets are never initialized in the Workers runtime.
    const { default: nodemailer } = await import('nodemailer');
    const opts = options();
    transport = Array.isArray(opts)
      ? nodemailer.createTransport(opts[0], opts[1])
      : nodemailer.createTransport(opts);
  }
  return transport;
}

// Falls back to the authenticating mailbox: most providers refuse to send as
// an address the account does not own, so that is the safest default.
const FROM = () => process.env.MAIL_FROM ?? process.env.SMTP_USER ?? 'no-reply@localhost';

export const MAIL_LOCALES = ['da', 'en', 'fa'];
export const MAIL_FALLBACK = 'en';

/**
 * The language a message is written in.
 *
 * The page sends the language it is showing, which is what the reader chose or
 * what their device asked for. A request without one -- an older page still
 * open in a tab, or a client that is not this site -- falls back to the
 * browser's Accept-Language, and then to English, the language this app keeps
 * for readers who have neither Danish nor Persian.
 */
export function mailLocale(asked, acceptLanguage = '') {
  const pick = (tag) => {
    const primary = String(tag ?? '').trim().toLowerCase().split(/[-_;]/)[0];
    return MAIL_LOCALES.includes(primary) ? primary : null;
  };
  if (pick(asked)) return pick(asked);
  for (const part of String(acceptLanguage).split(',')) {
    const found = pick(part);
    if (found) return found;
  }
  return MAIL_FALLBACK;
}

const TEXT = {
  verify: {
    da: {
      subject: 'Bekræft din e-mailadresse',
      lead: 'Bekræft din e-mailadresse for at fuldføre oprettelsen af din konto:',
      button: 'Bekræft e-mail',
      expiry: 'Linket udløber om 24 timer.',
      ignore: 'Hvis du ikke har oprettet en konto, kan du se bort fra denne mail.',
    },
    en: {
      subject: 'Confirm your email address',
      lead: 'Confirm your email address to finish creating your account:',
      button: 'Confirm email',
      expiry: 'The link expires in 24 hours.',
      ignore: 'If you did not create an account, you can ignore this message.',
    },
    fa: {
      subject: 'تأیید نشانی ایمیل',
      lead: 'برای کامل شدن ساخت حساب، نشانی ایمیل خود را تأیید کنید:',
      button: 'تأیید ایمیل',
      expiry: 'این پیوند تا ۲۴ ساعت معتبر است.',
      ignore: 'اگر شما حسابی نساخته‌اید، این پیام را نادیده بگیرید.',
    },
  },
  reset: {
    da: {
      subject: 'Vælg en ny adgangskode',
      lead: 'Vælg en ny adgangskode til din konto:',
      button: 'Vælg ny adgangskode',
      expiry: 'Linket udløber om en time.',
      ignore: 'Hvis du ikke har bedt om en ny adgangskode, kan du se bort fra denne mail; din nuværende adgangskode virker stadig.',
    },
    en: {
      subject: 'Choose a new password',
      lead: 'Choose a new password for your account:',
      button: 'Choose new password',
      expiry: 'The link expires in one hour.',
      ignore: 'If you did not ask for a new password, you can ignore this message; your current password still works.',
    },
    fa: {
      subject: 'انتخاب گذرواژهٔ تازه',
      lead: 'یک گذرواژهٔ تازه برای حساب خود انتخاب کنید:',
      button: 'انتخاب گذرواژهٔ تازه',
      expiry: 'این پیوند تا یک ساعت معتبر است.',
      ignore: 'اگر شما درخواست گذرواژهٔ تازه نداده‌اید، این پیام را نادیده بگیرید؛ گذرواژهٔ کنونی شما همچنان کار می‌کند.',
    },
  },
};

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/**
 * One message in one language: the one the reader had the site in when they
 * asked for it. Plain text alongside HTML so it stays readable in any client.
 * Persian is laid out right-to-left as a whole, not paragraph by paragraph; the
 * link itself stays left-to-right so it is not visually scrambled.
 */
export function compose(kind, url, locale) {
  const lang = MAIL_LOCALES.includes(locale) ? locale : MAIL_FALLBACK;
  const t = TEXT[kind][lang];
  const dir = lang === 'fa' ? 'rtl' : 'ltr';
  const text = [t.lead, '', url, '', t.expiry, t.ignore].join('\n');
  const html =
    `<div lang="${lang}" dir="${dir}" style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Tahoma,sans-serif;` +
    `font-size:16px;line-height:1.6;color:#1E2121;text-align:${dir === 'rtl' ? 'right' : 'left'}">` +
    `<p>${esc(t.lead)}</p>` +
    `<p style="margin:24px 0"><a href="${esc(url)}" ` +
    `style="display:inline-block;padding:12px 20px;background:#006D63;color:#fff;` +
    `text-decoration:none;border-radius:10px">${esc(t.button)}</a></p>` +
    `<p dir="ltr" style="font-size:13px;color:#575F5F;text-align:left;word-break:break-all">${esc(url)}</p>` +
    `<p style="font-size:13px;color:#575F5F">${esc(t.expiry)}</p>` +
    `<p style="font-size:13px;color:#575F5F">${esc(t.ignore)}</p>` +
    `</div>`;
  return { subject: t.subject, text, html, lang };
}

async function deliver(kind, to, url, locale) {
  const { subject, text, html } = compose(kind, url, locale);
  await (await mailer()).sendMail({ from: FROM(), to, subject, text, html });
}

export function sendVerification(to, url, locale = MAIL_FALLBACK) {
  return deliver('verify', to, url, locale);
}

export function sendReset(to, url, locale = MAIL_FALLBACK) {
  return deliver('reset', to, url, locale);
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
  const present = names.filter((n) => (process.env[n] ?? '').trim() !== '');
  if ((process.env.RESEND_API_KEY ?? '').trim()) present.push('RESEND_API_KEY');
  return present;
}

/** For the start-up log, so a misconfiguration is visible before anyone tries. */
export async function check() {
  if (overridden) return 'mail transport injected';
  if (!isConfigured()) return 'mail not configured (set SMTP_HOST/SMTP_USER/SMTP_PASS), sign-up disabled';
  try {
    await (await mailer()).verify();
    return `mail ready via ${process.env.SMTP_HOST ?? 'SMTP_URL'} as ${FROM()}`;
  } catch (err) {
    // The message names the host and the failure, never the password.
    return `mail configured but not usable: ${err.message}`;
  }
}
