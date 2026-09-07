import type { TranslationKey } from './i18n';
import type { Plejecenter, OwnershipGroup } from './types';

/** Danish phone numbers are read in pairs: 82 32 50 50. */
export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 8) return digits.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
  return raw;
}

export function telHref(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return `tel:+45${digits}`;
}

export function fullAddress(p: Plejecenter): string {
  return `${p.street}, ${p.postcode} ${p.city}`;
}

/** Google Maps deep link — search by address so the pin lands on the building. */
export function googleMapsHref(p: Plejecenter): string {
  const q = encodeURIComponent(`${p.name}, ${fullAddress(p)}`);
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

/**
 * Apple Maps. `ll` pins the exact geocoded point, `q` names it, and `dirflg=d`
 * asks for driving directions, so the link is useful on a phone in a car.
 */
export function appleMapsHref(p: Plejecenter): string {
  const q = encodeURIComponent(p.name);
  const addr = encodeURIComponent(fullAddress(p));
  return `https://maps.apple.com/?q=${q}&address=${addr}&ll=${p.lat},${p.lon}&dirflg=d`;
}

/** Show the host, not a 60-character URL that breaks the panel. */
export function prettyHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Privat and Friplejebolig are both non-public operators; one bucket. */
export function ownershipGroup(p: Plejecenter): OwnershipGroup {
  if (p.ownership === 'Kommunal') return 'Kommunal';
  if (p.ownership === 'Selvejende') return 'Selvejende';
  return 'Privat';
}

/** Translation key for the register's own word — more precise than the bucket. */
export function ownershipDetailKey(p: Plejecenter): TranslationKey {
  switch (p.ownership) {
    case 'Kommunal':
      return 'ownershipDetail.Kommunal';
    case 'Selvejende':
      return 'ownershipDetail.Selvejende';
    case 'Privat':
      return 'ownershipDetail.Privat';
    case 'Friplejebolig':
      return 'ownershipDetail.Friplejebolig';
    default:
      return 'ownershipDetail.Ukendt';
  }
}

/** Fold Danish letters so "Solund" finds "Sølund". */
export function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/[æä]/g, 'ae')
    .replace(/[øö]/g, 'oe')
    .replace(/[å]/g, 'a')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Sorting is locale-sensitive: Danish puts Æ, Ø and Å after Z, which is wrong
 * for an English or Persian reader looking at the same list. The collator is
 * rebuilt when the language changes.
 */
let collator = new Intl.Collator('da-DK', { sensitivity: 'base' });

export function setCollatorLocale(locale: string): void {
  collator = new Intl.Collator(locale === 'da' ? 'da-DK' : locale, { sensitivity: 'base' });
}

export function compare(a: string, b: string): number {
  return collator.compare(a, b);
}

/**
 * A day the reader chose (YYYY-MM-DD), written in their language.
 *
 * Built from the three numbers rather than parsed from the string: `new
 * Date('2026-09-01')` is midnight UTC, and formatted in any zone west of
 * Greenwich that is the 31st of August -- the day before the one they picked.
 * `new Date(y, m - 1, d)` is local midnight, which formats back to itself
 * everywhere.
 *
 * `medium` rather than `long`, because this sits on one line beside a label
 * rather than in a paragraph of its own.
 */
export function formatDay(iso: string, locale: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Intl.DateTimeFormat(dayLocale(locale), { dateStyle: 'medium' }).format(
    new Date(y, m - 1, d),
  );
}

/**
 * Today, as the YYYY-MM-DD an <input type="date"> takes.
 *
 * Built from the local getters rather than `toISOString().slice(0, 10)`: that
 * is the UTC day, and east of Greenwich after midnight -- or west of it before
 * -- it is not the day the reader is having.
 */
export function todayISO(): string {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/*
 * Persian script, Gregorian calendar.
 *
 * Intl's default for `fa` is the Persian calendar, and the 1st of March 2026
 * comes out of it as 10 Esfand 1404 -- a different number from the one the
 * reader typed, because every browser that ships a date picker ships a
 * Gregorian one. A day somebody chose has to read back as the day they chose.
 *
 * This is why the ratings dates further on are left alone: nobody types those,
 * so there is no number of the reader's to contradict, and the calendar they
 * read every other date in is the right one there.
 */
function dayLocale(locale: string): string {
  if (locale === 'da') return 'da-DK';
  if (locale === 'fa') return 'fa-IR-u-ca-gregory';
  return locale;
}

/* ------------------------------------------------------------------ jobs -- */

/**
 * Where to look for vacancies at one plejecenter.
 *
 * Care homes advertise on their own or their municipality's pages far more than
 * on any single portal, and the register carries no vacancy field, so the
 * honest thing is a search rather than a link pretending to be a listing. With
 * a website we scope the search to that host, which is the difference between
 * "jobs somewhere in Denmark" and "jobs at this address".
 */
export function jobsHref(p: Plejecenter): string {
  let host = '';
  try {
    if (p.web) host = new URL(p.web).host;
  } catch {
    /* a malformed URL in the register just means a broader search */
  }
  const query = host
    ? `site:${host} (job OR stilling OR ledige OR karriere)`
    : `"${p.name}" ${p.city} ledige stillinger`;
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}
