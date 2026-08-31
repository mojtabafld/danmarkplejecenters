/**
 * Localisation: Danish, English, Persian.
 *
 * Two deliberate rules about what is NOT translated:
 *
 *   - Plejecenter names and street addresses stay in Danish. They are proper
 *     nouns and real postal addresses; a translated address cannot be posted to,
 *     searched for, or read out to a taxi driver. The register's spelling is the
 *     useful one in every locale.
 *   - Municipality names stay Danish for the same reason, but the word
 *     "Kommune" around them is translated, so the sentence reads naturally.
 *
 * Numbers go through Intl, so Persian gets Persian digits.
 */

export type Locale = 'da' | 'en' | 'fa';

export const LOCALES: readonly Locale[] = ['da', 'en', 'fa'];

/** Native name, plus the short code shown on the switcher button. */
export const LOCALE_META: Record<Locale, { name: string; short: string; dir: 'ltr' | 'rtl' }> = {
  da: { name: 'Dansk', short: 'DA', dir: 'ltr' },
  en: { name: 'English', short: 'EN', dir: 'ltr' },
  fa: { name: 'فارسی', short: 'FA', dir: 'rtl' },
};

type Plural = { one: string; other: string };
type Entry = string | Plural;

/* eslint-disable @typescript-eslint/naming-convention */
const DA = {
  'app.title': 'Plejecentre',
  'app.subtitle': 'Hovedstadsområdet',
  'app.skipToList': 'Spring til listen over plejecentre',

  'header.toDark': 'Skift til mørkt tema',
  'header.toLight': 'Skift til lyst tema',
  'header.language': 'Vælg sprog',
  'header.languageMenu': 'Sprog',

  'search.label': 'Søg efter plejecenter, vej, postnummer eller by',
  'search.placeholder': 'Søg navn, vej eller postnummer',
  'search.clear': 'Ryd søgningen',

  'filter.municipality': 'Filtrér på kommune',
  'filter.allMunicipalities': 'Alle kommuner',
  'filter.ownership': 'Filtrér på driftsform',
  'filter.municipalitySuffix': '{name} Kommune',

  'ownership.Kommunal': 'Kommunal',
  'ownership.Selvejende': 'Selvejende',
  'ownership.Privat': 'Privat',
  'ownership.PrivatLong': 'Privat / friplejebolig',

  'ownershipDetail.Kommunal': 'Kommunalt drevet plejecenter',
  'ownershipDetail.Selvejende': 'Selvejende institution med driftsoverenskomst',
  'ownershipDetail.Privat': 'Privat leverandør',
  'ownershipDetail.Friplejebolig': 'Friplejebolig (privat, certificeret)',
  'ownershipDetail.Ukendt': 'Driftsform ikke oplyst i registret',

  'tally.noun': { one: 'plejecenter', other: 'plejecentre' },
  'tally.found': 'fundet',
  'tally.inMunicipality': 'i {name} Kommune',
  'tally.inMunicipalities': { one: 'i {n} kommune', other: 'i {n} kommuner' },
  'tally.noMatch': 'matcher søgningen',

  'results.label': 'Resultater',
  'results.municipality': 'kommune,',
  'result.homes': { one: '{n} bolig', other: '{n} boliger' },

  'empty.title': 'Ingen resultater',
  'empty.withQuery': 'Ingen plejecentre matcher "{q}".',
  'empty.withQueryIn': 'Ingen plejecentre matcher "{q}" i {name}.',
  'empty.noQuery': 'Ingen plejecentre matcher de valgte filtre.',
  'empty.hint':
    'Prøv et kortere søgeord, en anden kommune, eller slå driftsformerne til igen. Søgningen dækker navn, vej, postnummer og by.',
  'empty.reset': 'Nulstil filtre',


  'map.label': 'Kort over plejecentre i hovedstadsområdet',
  'map.zoomIn': 'Zoom ind på kortet',
  'map.zoomOut': 'Zoom ud på kortet',
  'map.reset': 'Vis hele hovedstadsområdet igen',
  'map.legend': 'Signaturforklaring',
  'map.legendTitle': 'Driftsform',
  'map.credit': 'Kort:',
  'map.fallback':
    'Baggrundskortet kunne ikke hentes fra OpenStreetMap-tjenesten. Placeringerne er stadig korrekte, og listen med adresser, telefonnumre og ruter virker uændret.',

  'locate.action': 'Vis min placering',
  'locate.stop': 'Skjul min placering',
  'locate.searching': 'Finder din placering',
  'locate.you': 'Din placering',
  'locate.accuracy': 'Nøjagtighed cirka {n} meter',
  'locate.found': 'Din placering er vist på kortet.',
  'locate.denied':
    'Adgang til din placering blev afvist. Slå placering til for dette websted i browserens indstillinger, og prøv igen.',
  'locate.unavailable':
    'Din placering kunne ikke bestemmes lige nu. Tjek at placering er slået til på enheden, og prøv igen.',
  'locate.timeout': 'Det tog for lang tid at finde din placering. Prøv igen.',
  'locate.insecure':
    'Placering kræver en sikker forbindelse (https). Åbn siden over https, og prøv igen.',
  'locate.unsupported': 'Din browser understøtter ikke placering.',
  'locate.far': 'Du er uden for hovedstadsområdet. Kortet viser stadig din placering.',
  'locate.dismiss': 'Luk beskeden',

  'panel.close': 'Luk detaljer om {name}',
  'panel.address': 'Adresse',
  'panel.ownership': 'Driftsform',
  'panel.capacity': 'Kapacitet',
  'panel.capacityValue': { one: '{n} plejebolig', other: '{n} plejeboliger' },
  'panel.phone': 'Telefon',
  'panel.email': 'E-mail',
  'panel.website': 'Officiel hjemmeside',
  'panel.visit': 'Besøg hjemmesiden',
  'panel.visitFor': 'for {name}',
  'panel.google': 'Google Maps',
  'panel.apple': 'Apple Maps',
  'panel.routeTo': ', rute til {name}',
  'panel.distance': '{n} km herfra',


  'live.results': { one: '{n} plejecenter vist på kortet.', other: '{n} plejecentre vist på kortet.' },
  'live.noResults': 'Ingen plejecentre matcher. Justér søgning eller filtre.',
  'live.resetView': 'Kortet viser hele hovedstadsområdet igen.',
  'live.basemapDown': 'Baggrundskortet kunne ikke hentes. Listen virker stadig.',
  'live.language': 'Sproget er skiftet til dansk.',
  'account.open': 'Konto',
  'account.title': 'Din konto',
  'account.email': 'E-mail',
  'account.password': 'Adgangskode',
  'account.signIn': 'Log ind',
  'account.signUp': 'Opret konto',
  'account.signOut': 'Log ud',
  'account.signedInAs': 'Logget ind som {email}',
  'account.deleteAccount': 'Slet konto',
  'account.deleteConfirm': 'Slet kontoen og alle besøgte plejecentre? Det kan ikke fortrydes.',
  'account.why': 'Log ind eller opret en konto',
  'visit.showSaved': 'Vis gemte steder ({n})',
  'visit.hint': 'Dine gemte steder finder du her.',
  'visit.hintDismiss': 'Luk tippet',
  'filters.hide': 'Skjul søgefelterne',
  'filters.show': 'Vis søgefelterne',
  'note.add': 'Tilføj note',
  'note.edit': 'Rediger note',
  'note.label': 'Din note',
  'note.placeholder': 'Fx hvornår du søgte, hvem du talte med, og hvad de sagde.',
  'note.save': 'Gem note',
  'note.cancel': 'Annullér',
  'note.saved': 'Noten er gemt.',
  'note.failed': 'Noten kunne ikke gemmes. Prøv igen.',
  'jobs.label': 'Job',
  'jobs.search': 'Søg ledige stillinger',
  'jobs.apply': 'Skriv en uopfordret ansøgning',
  'jobs.noEmail': 'Ingen e-mailadresse i registret. Ring i stedet.',
  'jobs.mailSubject': 'Uopfordret ansøgning',
  'jobs.mailBody':
    'Kære {name}\n\nJeg skriver til jer, fordi jeg gerne vil arbejde hos jer.\n\n[Skriv kort hvem du er, hvilken uddannelse eller erfaring du har, og hvornår du kan starte.]\n\nVenlig hilsen\n',
  'account.passwordHint': 'Mindst {n} tegn.',
  'account.close': 'Luk kontopanelet',
  'account.busy': 'Vent et øjeblik',
  'error.bad_email': 'Skriv en gyldig e-mailadresse.',
  'error.too_short': 'Adgangskoden skal være mindst {n} tegn.',
  'error.too_long': 'Adgangskoden er for lang.',
  'error.email_taken': 'Der findes allerede en konto med den e-mail. Log ind i stedet.',
  'error.bad_credentials': 'E-mail eller adgangskode passer ikke.',
  'error.too_many': 'For mange forsøg. Prøv igen om et kvarter.',
  'error.offline': 'Ingen forbindelse til serveren. Prøv igen.',
  'error.server_error': 'Noget gik galt. Prøv igen.',
  'visit.mark': 'Markér som besøgt',
  'visit.unmark': 'Fjern fra besøgte',
  'visit.marked': 'Besøgt',
  'visit.signInFirst': 'Log ind for at markere besøgte',
  'visit.failed': 'Kunne ikke gemmes. Prøv igen.',
  'visit.filter': 'Kun besøgte',
  'visit.none': 'Du har ikke markeret nogen plejecentre endnu.',
  'live.visitAdded': '{name} er markeret som besøgt.',
  'live.visitRemoved': '{name} er fjernet fra besøgte.',
  'verify.sent': 'Vi har sendt et link til {email}. Åbn det for at fuldføre oprettelsen.',
  'verify.checkSpam': 'Kig i spam-mappen, hvis den ikke er kommet efter et par minutter.',
  'verify.resend': 'Send linket igen',
  'verify.resent': 'Linket er sendt igen.',
  'verify.ok': 'Din e-mail er bekræftet. Log ind for at komme i gang.',
  'verify.failed': 'Linket virker ikke længere. Bed om et nyt, og prøv igen.',
  'verify.back': 'Tilbage til log ind',
  'error.not_verified': 'Bekræft din e-mail først. Vi har sendt et link til {email}.',
  'error.mail_unavailable': 'Oprettelse er midlertidigt utilgængelig. Prøv igen senere.',
  'error.mail_failed': 'Bekræftelsesmailen kunne ikke sendes. Prøv igen.',
  'error.no_database': 'Konti er midlertidigt utilgængelige. Prøv igen senere.',
} satisfies Record<string, Entry>;

type Key = keyof typeof DA;

const EN: Record<Key, Entry> = {
  'app.title': 'Care Homes',
  'app.subtitle': 'Greater Copenhagen',
  'app.skipToList': 'Skip to the list of care homes',

  'header.toDark': 'Switch to dark theme',
  'header.toLight': 'Switch to light theme',
  'header.language': 'Choose language',
  'header.languageMenu': 'Language',

  'search.label': 'Search by care home, street, postcode or town',
  'search.placeholder': 'Search name, street or postcode',
  'search.clear': 'Clear the search',

  'filter.municipality': 'Filter by municipality',
  'filter.allMunicipalities': 'All municipalities',
  'filter.ownership': 'Filter by operator',
  'filter.municipalitySuffix': '{name} Municipality',

  'ownership.Kommunal': 'Municipal',
  'ownership.Selvejende': 'Self-governing',
  'ownership.Privat': 'Private',
  'ownership.PrivatLong': 'Private / free-choice',

  'ownershipDetail.Kommunal': 'Run by the municipality',
  'ownershipDetail.Selvejende': 'Self-governing institution under municipal agreement',
  'ownershipDetail.Privat': 'Private provider',
  'ownershipDetail.Friplejebolig': 'Friplejebolig (private, certified)',
  'ownershipDetail.Ukendt': 'Operator not stated in the register',

  'tally.noun': { one: 'care home', other: 'care homes' },
  'tally.found': 'found',
  'tally.inMunicipality': 'in {name} Municipality',
  'tally.inMunicipalities': { one: 'in {n} municipality', other: 'in {n} municipalities' },
  'tally.noMatch': 'match your search',

  'results.label': 'Results',
  'results.municipality': 'municipality,',
  'result.homes': { one: '{n} home', other: '{n} homes' },

  'empty.title': 'No results',
  'empty.withQuery': 'No care homes match "{q}".',
  'empty.withQueryIn': 'No care homes match "{q}" in {name}.',
  'empty.noQuery': 'No care homes match the selected filters.',
  'empty.hint':
    'Try a shorter search term, another municipality, or switch the operator filters back on. Search covers name, street, postcode and town.',
  'empty.reset': 'Reset filters',


  'map.label': 'Map of care homes across Greater Copenhagen',
  'map.zoomIn': 'Zoom in',
  'map.zoomOut': 'Zoom out',
  'map.reset': 'Show the whole region again',
  'map.legend': 'Legend',
  'map.legendTitle': 'Operator',
  'map.credit': 'Map:',
  'map.fallback':
    'The background map could not be loaded from the OpenStreetMap service. The locations are still correct, and the list with addresses, phone numbers and routes works as normal.',

  'locate.action': 'Show my location',
  'locate.stop': 'Hide my location',
  'locate.searching': 'Finding your location',
  'locate.you': 'Your location',
  'locate.accuracy': 'Accurate to about {n} metres',
  'locate.found': 'Your location is shown on the map.',
  'locate.denied':
    'Location access was denied. Allow location for this site in your browser settings, then try again.',
  'locate.unavailable':
    'Your location could not be determined right now. Check that location services are on, then try again.',
  'locate.timeout': 'Finding your location took too long. Try again.',
  'locate.insecure':
    'Location needs a secure connection (https). Open the page over https, then try again.',
  'locate.unsupported': 'Your browser does not support location.',
  'locate.far': 'You are outside Greater Copenhagen. The map still shows where you are.',
  'locate.dismiss': 'Dismiss this message',

  'panel.close': 'Close details for {name}',
  'panel.address': 'Address',
  'panel.ownership': 'Operator',
  'panel.capacity': 'Capacity',
  'panel.capacityValue': { one: '{n} care home place', other: '{n} care home places' },
  'panel.phone': 'Phone',
  'panel.email': 'Email',
  'panel.website': 'Official website',
  'panel.visit': 'Visit the website',
  'panel.visitFor': 'for {name}',
  'panel.google': 'Google Maps',
  'panel.apple': 'Apple Maps',
  'panel.routeTo': ', route to {name}',
  'panel.distance': '{n} km from you',


  'live.results': { one: '{n} care home shown on the map.', other: '{n} care homes shown on the map.' },
  'live.noResults': 'No care homes match. Adjust the search or the filters.',
  'live.resetView': 'The map shows the whole region again.',
  'live.basemapDown': 'The background map could not be loaded. The list still works.',
  'live.language': 'Language changed to English.',
  'account.open': 'Account',
  'account.title': 'Your account',
  'account.email': 'Email',
  'account.password': 'Password',
  'account.signIn': 'Sign in',
  'account.signUp': 'Create account',
  'account.signOut': 'Sign out',
  'account.signedInAs': 'Signed in as {email}',
  'account.deleteAccount': 'Delete account',
  'account.deleteConfirm': 'Delete your account and every care home you have marked? This cannot be undone.',
  'account.why': 'Sign in or create an account',
  'visit.showSaved': 'Show saved places ({n})',
  'visit.hint': 'Your saved places show up here.',
  'visit.hintDismiss': 'Dismiss this tip',
  'filters.hide': 'Hide the search fields',
  'filters.show': 'Show the search fields',
  'note.add': 'Add a note',
  'note.edit': 'Edit note',
  'note.label': 'Your note',
  'note.placeholder': 'When you applied, who you spoke to, what they said.',
  'note.save': 'Save note',
  'note.cancel': 'Cancel',
  'note.saved': 'Note saved.',
  'note.failed': 'The note could not be saved. Try again.',
  'jobs.label': 'Jobs',
  'jobs.search': 'Search for vacancies',
  'jobs.apply': 'Write an application',
  'jobs.noEmail': 'No email address in the register. Phone them instead.',
  'jobs.mailSubject': 'Application',
  'jobs.mailBody':
    'Dear {name}\n\nI am writing because I would like to work with you.\n\n[Say briefly who you are, what training or experience you have, and when you could start.]\n\nKind regards\n',
  'account.passwordHint': 'At least {n} characters.',
  'account.close': 'Close the account panel',
  'account.busy': 'One moment',
  'error.bad_email': 'Enter a valid email address.',
  'error.too_short': 'The password must be at least {n} characters.',
  'error.too_long': 'That password is too long.',
  'error.email_taken': 'An account with that email already exists. Sign in instead.',
  'error.bad_credentials': 'That email and password do not match.',
  'error.too_many': 'Too many attempts. Try again in about fifteen minutes.',
  'error.offline': 'Could not reach the server. Try again.',
  'error.server_error': 'Something went wrong. Try again.',
  'visit.mark': 'Mark as visited',
  'visit.unmark': 'Remove from visited',
  'visit.marked': 'Visited',
  'visit.signInFirst': 'Sign in to mark visits',
  'visit.failed': 'That could not be saved. Try again.',
  'visit.filter': 'Visited only',
  'visit.none': 'You have not marked any care homes yet.',
  'live.visitAdded': '{name} marked as visited.',
  'live.visitRemoved': '{name} removed from visited.',
  'verify.sent': 'We have sent a link to {email}. Open it to finish creating your account.',
  'verify.checkSpam': 'Check your spam folder if it has not arrived after a couple of minutes.',
  'verify.resend': 'Send the link again',
  'verify.resent': 'The link has been sent again.',
  'verify.ok': 'Your email is confirmed. Sign in to get started.',
  'verify.failed': 'That link no longer works. Ask for a new one and try again.',
  'verify.back': 'Back to sign in',
  'error.not_verified': 'Confirm your email first. We have sent a link to {email}.',
  'error.mail_unavailable': 'Creating accounts is temporarily unavailable. Try again later.',
  'error.mail_failed': 'The confirmation email could not be sent. Try again.',
  'error.no_database': 'Accounts are temporarily unavailable. Try again later.',
};

const FA: Record<Key, Entry> = {
  'app.title': 'مراکز مراقبت سالمندان',
  'app.subtitle': 'منطقه کلان شهری کپنهاگ',
  'app.skipToList': 'پرش به فهرست مراکز مراقبت',

  'header.toDark': 'تغییر به پوستهٔ تیره',
  'header.toLight': 'تغییر به پوستهٔ روشن',
  'header.language': 'انتخاب زبان',
  'header.languageMenu': 'زبان',

  'search.label': 'جست‌وجو بر پایهٔ نام مرکز، خیابان، کد پستی یا شهر',
  'search.placeholder': 'جست‌وجوی نام، خیابان یا کد پستی',
  'search.clear': 'پاک کردن جست‌وجو',

  'filter.municipality': 'پالایش بر پایهٔ شهرداری',
  'filter.allMunicipalities': 'همهٔ شهرداری‌ها',
  'filter.ownership': 'پالایش بر پایهٔ نوع اداره',
  'filter.municipalitySuffix': 'شهرداری {name}',

  'ownership.Kommunal': 'شهرداری',
  'ownership.Selvejende': 'خودگردان',
  'ownership.Privat': 'خصوصی',
  'ownership.PrivatLong': 'خصوصی / آزاد',

  'ownershipDetail.Kommunal': 'مرکز مراقبت زیر نظر شهرداری',
  'ownershipDetail.Selvejende': 'نهاد خودگردان با قرارداد شهرداری',
  'ownershipDetail.Privat': 'ارائه‌دهندهٔ خصوصی',
  'ownershipDetail.Friplejebolig': 'مسکن مراقبتی آزاد (خصوصی و دارای گواهی)',
  'ownershipDetail.Ukendt': 'نوع ادارهٔ آن در سامانه ثبت نشده است',

  'tally.noun': { one: 'مرکز مراقبت', other: 'مرکز مراقبت' },
  'tally.found': 'یافت شد',
  'tally.inMunicipality': 'در شهرداری {name}',
  'tally.inMunicipalities': { one: 'در {n} شهرداری', other: 'در {n} شهرداری' },
  'tally.noMatch': 'با جست‌وجوی شما همخوانی دارد',

  'results.label': 'نتایج',
  'results.municipality': 'شهرداری،',
  'result.homes': { one: '{n} واحد', other: '{n} واحد' },

  'empty.title': 'نتیجه‌ای یافت نشد',
  'empty.withQuery': 'هیچ مرکزی با «{q}» همخوانی ندارد.',
  'empty.withQueryIn': 'هیچ مرکزی با «{q}» در {name} همخوانی ندارد.',
  'empty.noQuery': 'هیچ مرکزی با پالایه‌های انتخاب‌شده همخوانی ندارد.',
  'empty.hint':
    'واژهٔ کوتاه‌تری بنویسید، شهرداری دیگری برگزینید، یا پالایه‌های نوع اداره را دوباره روشن کنید. جست‌وجو نام، خیابان، کد پستی و شهر را در بر می‌گیرد.',
  'empty.reset': 'بازنشانی پالایه‌ها',


  'map.label': 'نقشهٔ مراکز مراقبت در منطقهٔ کپنهاگ',
  'map.zoomIn': 'بزرگ‌نمایی نقشه',
  'map.zoomOut': 'کوچک‌نمایی نقشه',
  'map.reset': 'نمایش دوبارهٔ کل منطقه',
  'map.legend': 'راهنمای نقشه',
  'map.legendTitle': 'نوع اداره',
  'map.credit': 'نقشه:',
  'map.fallback':
    'نقشهٔ پس‌زمینه از سرویس OpenStreetMap بارگیری نشد. موقعیت‌ها همچنان درست هستند و فهرست نشانی‌ها، شماره‌های تلفن و مسیرها بدون تغییر کار می‌کند.',

  'locate.action': 'نمایش موقعیت من',
  'locate.stop': 'پنهان کردن موقعیت من',
  'locate.searching': 'در حال یافتن موقعیت شما',
  'locate.you': 'موقعیت شما',
  'locate.accuracy': 'دقت نزدیک به {n} متر',
  'locate.found': 'موقعیت شما روی نقشه نشان داده شد.',
  'locate.denied':
    'دسترسی به موقعیت رد شد. در تنظیمات مرورگر، دسترسی به موقعیت را برای این وب‌گاه روشن کنید و دوباره تلاش کنید.',
  'locate.unavailable':
    'موقعیت شما اکنون به دست نیامد. بررسی کنید که خدمات موقعیت روی دستگاه روشن باشد و دوباره تلاش کنید.',
  'locate.timeout': 'یافتن موقعیت شما بیش از اندازه طول کشید. دوباره تلاش کنید.',
  'locate.insecure':
    'موقعیت‌یابی به پیوند امن (https) نیاز دارد. صفحه را با https باز کنید و دوباره تلاش کنید.',
  'locate.unsupported': 'مرورگر شما از موقعیت‌یابی پشتیبانی نمی‌کند.',
  'locate.far': 'شما بیرون از منطقهٔ کپنهاگ هستید. نقشه همچنان موقعیت شما را نشان می‌دهد.',
  'locate.dismiss': 'بستن این پیام',

  'panel.close': 'بستن جزئیات {name}',
  'panel.address': 'نشانی',
  'panel.ownership': 'نوع اداره',
  'panel.capacity': 'ظرفیت',
  'panel.capacityValue': { one: '{n} واحد مسکونی', other: '{n} واحد مسکونی' },
  'panel.phone': 'تلفن',
  'panel.email': 'ایمیل',
  'panel.website': 'وب‌سایت رسمی',
  'panel.visit': 'مشاهدهٔ وب‌سایت',
  'panel.visitFor': 'برای {name}',
  'panel.google': 'نقشهٔ گوگل',
  'panel.apple': 'نقشهٔ اپل',
  'panel.routeTo': '، مسیر تا {name}',
  'panel.distance': '{n} کیلومتر تا شما',


  'live.results': { one: '{n} مرکز روی نقشه نشان داده شد.', other: '{n} مرکز روی نقشه نشان داده شد.' },
  'live.noResults': 'هیچ مرکزی همخوانی ندارد. جست‌وجو یا پالایه‌ها را تغییر دهید.',
  'live.resetView': 'نقشه دوباره کل منطقه را نشان می‌دهد.',
  'live.basemapDown': 'نقشهٔ پس‌زمینه بارگیری نشد. فهرست همچنان کار می‌کند.',
  'live.language': 'زبان به فارسی تغییر کرد.',
  'account.open': 'حساب کاربری',
  'account.title': 'حساب شما',
  'account.email': 'ایمیل',
  'account.password': 'گذرواژه',
  'account.signIn': 'ورود',
  'account.signUp': 'ساختن حساب',
  'account.signOut': 'خروج',
  'account.signedInAs': 'وارد شده با {email}',
  'account.deleteAccount': 'حذف حساب',
  'account.deleteConfirm': 'حساب شما و همهٔ مراکز نشان‌شده حذف شود؟ این کار بازگشت‌پذیر نیست.',
  'account.why': 'ورود یا ایجاد حساب کاربری',
  'visit.showSaved': 'نمایش مکان‌های ذخیره‌شده ({n})',
  'visit.hint': 'مکان‌های ذخیره‌شدهٔ شما اینجا دیده می‌شوند.',
  'visit.hintDismiss': 'بستن این راهنما',
  'filters.hide': 'پنهان کردن فیلدهای جست‌وجو',
  'filters.show': 'نمایش فیلدهای جست‌وجو',
  'note.add': 'افزودن یادداشت',
  'note.edit': 'ویرایش یادداشت',
  'note.label': 'یادداشت شما',
  'note.placeholder': 'برای نمونه کِی درخواست دادید، با چه کسی حرف زدید و چه گفتند.',
  'note.save': 'ذخیرهٔ یادداشت',
  'note.cancel': 'انصراف',
  'note.saved': 'یادداشت ذخیره شد.',
  'note.failed': 'یادداشت ذخیره نشد. دوباره تلاش کنید.',
  'jobs.label': 'کار',
  'jobs.search': 'جست‌وجوی آگهی‌های استخدام',
  'jobs.apply': 'نوشتن درخواست کار',
  'jobs.noEmail': 'نشانی ایمیلی در سامانه ثبت نشده است. به جای آن تماس بگیرید.',
  'jobs.mailSubject': 'درخواست کار',
  'jobs.mailBody':
    'با سلام، {name}\n\nبرای کار در مجموعهٔ شما این پیام را می‌نویسم.\n\n[کوتاه بنویسید که هستید، چه آموزش یا تجربه‌ای دارید و از چه زمانی می‌توانید شروع کنید.]\n\nبا احترام\n',
  'account.passwordHint': 'دست‌کم {n} نویسه.',
  'account.close': 'بستن پنل حساب',
  'account.busy': 'کمی صبر کنید',
  'error.bad_email': 'یک نشانی ایمیل درست بنویسید.',
  'error.too_short': 'گذرواژه باید دست‌کم {n} نویسه باشد.',
  'error.too_long': 'این گذرواژه بیش از اندازه بلند است.',
  'error.email_taken': 'حسابی با این ایمیل از پیش هست. به جای آن وارد شوید.',
  'error.bad_credentials': 'ایمیل و گذرواژه با هم نمی‌خوانند.',
  'error.too_many': 'تلاش بیش از اندازه. حدود پانزده دقیقه دیگر دوباره تلاش کنید.',
  'error.offline': 'دسترسی به سرور ممکن نشد. دوباره تلاش کنید.',
  'error.server_error': 'خطایی رخ داد. دوباره تلاش کنید.',
  'visit.mark': 'نشان کردن به‌عنوان بازدیدشده',
  'visit.unmark': 'برداشتن از بازدیدشده‌ها',
  'visit.marked': 'بازدیدشده',
  'visit.signInFirst': 'برای نشان کردن، وارد شوید',
  'visit.failed': 'ذخیره نشد. دوباره تلاش کنید.',
  'visit.filter': 'فقط بازدیدشده‌ها',
  'visit.none': 'هنوز هیچ مرکزی را نشان نکرده‌اید.',
  'live.visitAdded': '{name} به‌عنوان بازدیدشده نشان شد.',
  'live.visitRemoved': '{name} از بازدیدشده‌ها برداشته شد.',
  'verify.sent': 'پیوندی به {email} فرستادیم. برای کامل شدن ساخت حساب آن را باز کنید.',
  'verify.checkSpam': 'اگر تا چند دقیقه نرسید، پوشهٔ هرزنامه را ببینید.',
  'verify.resend': 'فرستادن دوبارهٔ پیوند',
  'verify.resent': 'پیوند دوباره فرستاده شد.',
  'verify.ok': 'ایمیل شما تأیید شد. برای شروع وارد شوید.',
  'verify.failed': 'این پیوند دیگر کار نمی‌کند. پیوند تازه بخواهید و دوباره تلاش کنید.',
  'verify.back': 'بازگشت به ورود',
  'error.not_verified': 'نخست ایمیل خود را تأیید کنید. پیوندی به {email} فرستادیم.',
  'error.mail_unavailable': 'ساختن حساب موقتاً در دسترس نیست. بعداً تلاش کنید.',
  'error.mail_failed': 'ایمیل تأیید فرستاده نشد. دوباره تلاش کنید.',
  'error.no_database': 'حساب‌ها موقتاً در دسترس نیستند. بعداً تلاش کنید.',
};
/* eslint-enable @typescript-eslint/naming-convention */

const DICT: Record<Locale, Record<Key, Entry>> = { da: DA, en: EN, fa: FA };

const STORAGE_KEY = 'plejekort.locale';

/**
 * The language a first-time visitor gets, before they have chosen anything.
 *
 * Deliberately NOT `navigator.language`: the audience this is built for is
 * fixed, and the browser's language is a poor proxy for it. An explicit choice
 * from the switcher always wins and is remembered.
 *
 * Note what this does not change: plejecenter names, street addresses and
 * phone numbers stay Danish and left-to-right in every locale, because they are
 * postal addresses and dialled numbers rather than prose.
 */
export const DEFAULT_LOCALE: Locale = 'fa';

function detect(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && (LOCALES as readonly string[]).includes(saved)) return saved as Locale;
  } catch {
    /* private mode: no stored choice to honour */
  }
  return DEFAULT_LOCALE;
}

export class I18n {
  locale: Locale;
  private listeners = new Set<(l: Locale) => void>();
  private plurals!: Intl.PluralRules;
  private numbers!: Intl.NumberFormat;

  constructor() {
    this.locale = detect();
    this.refresh();
  }

  private refresh(): void {
    this.plurals = new Intl.PluralRules(this.locale);
    this.numbers = new Intl.NumberFormat(this.locale);
  }

  get dir(): 'ltr' | 'rtl' {
    return LOCALE_META[this.locale].dir;
  }

  /** Localised digits. Persian renders 148 as ۱۴۸, which is what a reader expects. */
  n(value: number): string {
    return this.numbers.format(value);
  }

  /**
   * Look up `key`, pick the plural form when `params.n` is a number, and
   * substitute `{placeholders}`. Counts are inserted already localised.
   */
  t(key: Key, params: Record<string, string | number> = {}): string {
    const entry = DICT[this.locale][key] ?? DA[key];
    // An unknown key returns itself rather than throwing. A string that has not
    // been translated yet should show as an odd label, never as a blank page.
    if (entry === undefined) return String(key);
    let text =
      typeof entry === 'string'
        ? entry
        : entry[this.plurals.select(Number(params.n ?? 0)) === 'one' ? 'one' : 'other'];

    for (const [k, v] of Object.entries(params)) {
      text = text.replaceAll(`{${k}}`, typeof v === 'number' ? this.n(v) : v);
    }
    return text;
  }

  onChange(fn: (l: Locale) => void): void {
    this.listeners.add(fn);
  }

  set(locale: Locale): void {
    if (locale === this.locale) return;
    this.locale = locale;
    this.refresh();
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      /* private mode: the choice still applies for this session */
    }
    this.applyDocument();
    for (const fn of this.listeners) fn(locale);
  }

  /** Language and direction belong on the document, for the browser and for AT. */
  applyDocument(): void {
    const root = document.documentElement;
    root.lang = this.locale;
    root.dir = this.dir;
  }
}

export type TranslationKey = Key;
