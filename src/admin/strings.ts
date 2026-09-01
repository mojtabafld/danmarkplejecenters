/**
 * The admin panel's own strings.
 *
 * A separate dictionary from the site's, because these words are only ever
 * read by the handful of people named in ADMIN_EMAILS and there is no reason
 * to ship them to everybody else. Same three languages: whoever runs this site
 * reads it in the language they set, and an English-only back office would be
 * the one screen in the product that does not.
 */
export type AdminKey =
  | 'title'
  | 'subtitle'
  | 'backToMap'
  | 'refused'
  | 'refusedWhy'
  | 'refusedNoAdmins'
  | 'signIn'
  | 'loading'
  | 'failed'
  | 'retry'
  | 'tabTraffic'
  | 'tabUsers'
  | 'tabReviews'
  | 'viewsToday'
  | 'visitorsToday'
  | 'viewsWeek'
  | 'viewsAll'
  | 'registered'
  | 'verified'
  | 'newThisWeek'
  | 'pending'
  | 'trafficTitle'
  | 'trafficNote'
  | 'views'
  | 'visitors'
  | 'signupsTitle'
  | 'signupsNote'
  | 'localeTitle'
  | 'topTitle'
  | 'noData'
  | 'usersTitle'
  | 'colEmail'
  | 'colJoined'
  | 'colVerified'
  | 'colSaved'
  | 'colReviews'
  | 'yes'
  | 'no'
  | 'moreUsers'
  | 'queueTitle'
  | 'queueEmpty'
  | 'approve'
  | 'reject'
  | 'approved'
  | 'rejected'
  | 'showPending'
  | 'showApproved'
  | 'showRejected'
  | 'stars'
  | 'showAll'
  | 'showFewer'
  | 'privacy';

type Dict = Record<AdminKey, string>;

const DA: Dict = {
  title: 'Administration',
  subtitle: 'Plejefinder',
  backToMap: 'Tilbage til kortet',
  refused: 'Ingen adgang',
  refusedWhy: 'Denne side er kun for administratorer. Log ind med en administratorkonto.',
  refusedNoAdmins: 'Der er ingen administratorer opsat. Sæt ADMIN_EMAILS på komponenten og deploy igen.',
  signIn: 'Log ind',
  loading: 'Henter …',
  failed: 'Kunne ikke hentes.',
  retry: 'Prøv igen',
  tabTraffic: 'Trafik',
  tabUsers: 'Brugere',
  tabReviews: 'Kommentarer',
  viewsToday: 'Sidevisninger i dag',
  visitorsToday: 'Besøgende i dag',
  viewsWeek: 'Visninger, 7 dage',
  viewsAll: 'Visninger i alt',
  registered: 'Registrerede brugere',
  verified: 'Bekræftede',
  newThisWeek: 'Nye på 7 dage',
  pending: 'Afventer godkendelse',
  trafficTitle: 'Sidevisninger og besøgende',
  trafficNote: 'De seneste 30 dage.',
  views: 'Sidevisninger',
  visitors: 'Besøgende',
  signupsTitle: 'Nye brugere pr. dag',
  signupsNote: 'De seneste 30 dage.',
  localeTitle: 'Sprog',
  topTitle: 'Mest åbnede plejecentre',
  noData: 'Ingen data endnu.',
  usersTitle: 'Registrerede brugere',
  colEmail: 'E-mail',
  colJoined: 'Oprettet',
  colVerified: 'Bekræftet',
  colSaved: 'Gemte',
  colReviews: 'Bedømmelser',
  yes: 'Ja',
  no: 'Nej',
  moreUsers: 'Hent flere',
  queueTitle: 'Kommentarer til gennemsyn',
  queueEmpty: 'Ingen kommentarer her.',
  approve: 'Godkend',
  reject: 'Afvis',
  approved: 'Godkendt',
  rejected: 'Afvist',
  showPending: 'Afventer',
  showApproved: 'Godkendte',
  showRejected: 'Afviste',
  stars: '{n} ud af 5',
  showAll: 'Vis alle ({n})',
  showFewer: 'Vis færre',
  privacy:
    'Trafiktal er anonyme: ingen IP-adresser, ingen cookies. Besøgende tælles med et dagligt roterende ' +
    'hashsalt, så tallene ikke kan følge nogen fra dag til dag.',
};

const EN: Dict = {
  title: 'Administration',
  subtitle: 'Plejefinder',
  backToMap: 'Back to the map',
  refused: 'No access',
  refusedWhy: 'This page is for administrators. Sign in with an administrator account.',
  refusedNoAdmins: 'No administrators are configured. Set ADMIN_EMAILS on the component and deploy again.',
  signIn: 'Sign in',
  loading: 'Loading …',
  failed: 'Could not be loaded.',
  retry: 'Try again',
  tabTraffic: 'Traffic',
  tabUsers: 'Users',
  tabReviews: 'Comments',
  viewsToday: 'Page views today',
  visitorsToday: 'Visitors today',
  viewsWeek: 'Views, 7 days',
  viewsAll: 'Views, all time',
  registered: 'Registered users',
  verified: 'Verified',
  newThisWeek: 'New in 7 days',
  pending: 'Waiting for approval',
  trafficTitle: 'Page views and visitors',
  trafficNote: 'The last 30 days.',
  views: 'Page views',
  visitors: 'Visitors',
  signupsTitle: 'New users per day',
  signupsNote: 'The last 30 days.',
  localeTitle: 'Language',
  topTitle: 'Most opened plejecentre',
  noData: 'No data yet.',
  usersTitle: 'Registered users',
  colEmail: 'E-mail',
  colJoined: 'Joined',
  colVerified: 'Verified',
  colSaved: 'Saved',
  colReviews: 'Ratings',
  yes: 'Yes',
  no: 'No',
  moreUsers: 'Load more',
  queueTitle: 'Comments to review',
  queueEmpty: 'No comments here.',
  approve: 'Approve',
  reject: 'Reject',
  approved: 'Approved',
  rejected: 'Rejected',
  showPending: 'Waiting',
  showApproved: 'Approved',
  showRejected: 'Rejected',
  stars: '{n} out of 5',
  showAll: 'Show all ({n})',
  showFewer: 'Show fewer',
  privacy:
    'Traffic figures are anonymous: no IP addresses, no cookies. Visitors are counted with a salt that ' +
    'rotates daily, so the numbers cannot follow anyone from one day to the next.',
};

const FA: Dict = {
  title: 'مدیریت',
  subtitle: 'پلیه‌فیندر',
  backToMap: 'بازگشت به نقشه',
  refused: 'دسترسی ندارید',
  refusedWhy: 'این صفحه ویژهٔ مدیران است. با یک حساب مدیر وارد شوید.',
  refusedNoAdmins: 'هیچ مدیری تعریف نشده است. مقدار ADMIN_EMAILS را تنظیم و دوباره استقرار کنید.',
  signIn: 'ورود',
  loading: 'در حال دریافت …',
  failed: 'دریافت نشد.',
  retry: 'دوباره تلاش کنید',
  tabTraffic: 'ترافیک',
  tabUsers: 'کاربران',
  tabReviews: 'نظرها',
  viewsToday: 'بازدید صفحه امروز',
  visitorsToday: 'بازدیدکنندگان امروز',
  viewsWeek: 'بازدید، ۷ روز',
  viewsAll: 'بازدید کل',
  registered: 'کاربران ثبت‌شده',
  verified: 'تأییدشده',
  newThisWeek: 'جدید در ۷ روز',
  pending: 'در انتظار تأیید',
  trafficTitle: 'بازدید صفحه و بازدیدکنندگان',
  trafficNote: '۳۰ روز گذشته.',
  views: 'بازدید صفحه',
  visitors: 'بازدیدکنندگان',
  signupsTitle: 'کاربران جدید در روز',
  signupsNote: '۳۰ روز گذشته.',
  localeTitle: 'زبان',
  topTitle: 'پربازدیدترین مراکز',
  noData: 'هنوز داده‌ای نیست.',
  usersTitle: 'کاربران ثبت‌شده',
  colEmail: 'ایمیل',
  colJoined: 'تاریخ عضویت',
  colVerified: 'تأییدشده',
  colSaved: 'ذخیره‌ها',
  colReviews: 'امتیازها',
  yes: 'بله',
  no: 'خیر',
  moreUsers: 'دریافت بیشتر',
  queueTitle: 'نظرهای در انتظار بررسی',
  queueEmpty: 'نظری اینجا نیست.',
  approve: 'تأیید',
  reject: 'رد',
  approved: 'تأییدشده',
  rejected: 'ردشده',
  showPending: 'در انتظار',
  showApproved: 'تأییدشده',
  showRejected: 'ردشده',
  stars: '{n} از ۵',
  showAll: 'نمایش همه ({n})',
  showFewer: 'نمایش کمتر',
  privacy:
    'آمار ترافیک ناشناس است: بدون نشانی IP و بدون کوکی. بازدیدکنندگان با نمکی که هر روز عوض می‌شود شمرده ' +
    'می‌شوند، بنابراین این اعداد نمی‌توانند کسی را از روزی به روز دیگر دنبال کنند.',
};

export type AdminLocale = 'da' | 'en' | 'fa';

const DICT: Record<AdminLocale, Dict> = { da: DA, en: EN, fa: FA };

export const DIR: Record<AdminLocale, 'ltr' | 'rtl'> = { da: 'ltr', en: 'ltr', fa: 'rtl' };

/** The site's stored choice, so the panel opens in the language the map is in. */
export function detectLocale(): AdminLocale {
  try {
    const v = localStorage.getItem('plejekort.locale');
    if (v === 'da' || v === 'en' || v === 'fa') return v;
  } catch {
    /* private mode: fall through to the browser */
  }
  const lang = navigator.language.slice(0, 2);
  return lang === 'fa' || lang === 'en' ? lang : 'da';
}

export function translator(locale: AdminLocale): (k: AdminKey, p?: Record<string, string>) => string {
  const dict = DICT[locale];
  return (key, params = {}) => {
    let text = dict[key] ?? DA[key] ?? key;
    for (const [k, v] of Object.entries(params)) text = text.replaceAll(`{${k}}`, v);
    return text;
  };
}
