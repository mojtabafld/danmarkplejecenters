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
  'app.subtitle': 'Hele landet',
  'intro.label': 'Kort rundvisning',
  'intro.progress': 'Trin {n} af {total}',
  'intro.next': 'Videre',
  'intro.start': 'Kom i gang',
  'intro.skip': 'Spring over',
  'intro.map.title': 'Hvert plejecenter på kortet',
  'intro.map.body':
    '{n} plejecentre i alle {k} kommuner i hele landet. Søg på navn, eller vælg en kommune, og se dem alle sammen.',
  'intro.jobs.title': 'Job på det enkelte center',
  'intro.jobs.body':
    'Hvert center har et link til ledige stillinger netop dér — sammen med adresse, telefon og den officielle hjemmeside, så du kan henvende dig direkte.',
  'intro.saved.title': 'Gem dem du har søgt',
  'intro.saved.body':
    'Opret en konto, marker de centre du har skrevet til, og skriv en note: hvornår, hvem du talte med, og hvad de sagde.',
  'app.skipToList': 'Spring til listen over plejecentre',

  'header.toDark': 'Skift til mørkt tema',
  'header.toLight': 'Skift til lyst tema',
  'header.language': 'Vælg sprog',
  'header.languageMenu': 'Sprog',

  'search.label': 'Søg efter plejecenter, vej, postnummer eller by',
  'search.placeholder': 'Søg navn, vej eller postnummer',
  'search.clear': 'Ryd søgningen',
  'dock.search': 'Søg på kortet',
  'dock.close': 'Luk søgningen',
  'dock.savedSignedOut': 'Log ind for at se dine gemte steder',
  'dock.clearFilters': 'Ryd filtrene og vis alle plejecentre',

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


  'region.label': 'Landsdel',
  'region.menu': 'Vælg landsdel',
  'region.all': 'Danmark',
  'region.empty': 'Ingen i denne udgave af data',
  'region.hint': 'Vælg Sjælland, Fyn eller Jylland for at se én landsdel ad gangen.',

  'map.label': 'Kort over plejecentre i hele Danmark',
  'map.zoomIn': 'Zoom ind på kortet',
  'map.zoomOut': 'Zoom ud på kortet',
  'map.reset': 'Vis hele området igen',
  'map.legend': 'Signaturforklaring',
  'map.legendTitle': 'Driftsform',
  'map.legendSaved': 'Gemt af dig',
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
  'locate.far': 'Du er uden for kortets område. Kortet viser stadig din placering.',
  'locate.dismiss': 'Luk beskeden',

  'panel.close': 'Luk detaljer om {name}',
  'panel.address': 'Adresse',
  'panel.ownership': 'Driftsform',
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
  'live.resetView': 'Kortet viser hele området igen.',
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
  'note.add': 'Tilføj note',
  'note.edit': 'Rediger note',
  'note.label': 'Din note',
  'note.placeholder': 'Fx hvornår du søgte, hvem du talte med, og hvad de sagde.',
  'note.save': 'Gem note',
  'note.cancel': 'Annullér',
  'note.saved': 'Noten er gemt.',
  'note.failed': 'Noten kunne ikke gemmes. Prøv igen.',
  'rating.title': 'Bedømmelser',
  'rating.none': 'Ingen bedømmelser endnu.',
  'rating.count': { one: '{n} bedømmelse', other: '{n} bedømmelser' },
  'rating.outOf': '{n} ud af 5',
  'rating.spread': '{stars} stjerner: {n}',
  'rating.yours': 'Din bedømmelse',
  'rating.pick': '{n} ud af 5 stjerner',
  'rating.pickLegend': 'Vælg antal stjerner',
  'rating.comment': 'Kommentar (valgfri)',
  'rating.commentHint': 'Kommentarer læses igennem, før de vises.',
  'rating.placeholder': 'Fx hvordan besøget gik, og hvad du lagde mærke til.',
  'rating.save': 'Gem bedømmelse',
  'rating.saving': 'Gemmer …',
  'rating.saved': 'Din bedømmelse er gemt.',
  'rating.remove': 'Fjern min bedømmelse',
  'rating.removed': 'Din bedømmelse er fjernet.',
  'rating.failed': 'Bedømmelsen kunne ikke gemmes. Prøv igen.',
  'rating.needStars': 'Vælg antal stjerner først.',
  'rating.pending': 'Din kommentar afventer godkendelse og vises endnu ikke.',
  'rating.approved': 'Din kommentar er offentliggjort.',
  'rating.rejected': 'Din kommentar blev ikke offentliggjort. Din bedømmelse tæller stadig med.',
  'rating.signIn': 'Log ind for at bedømme',
  'rating.unverified': 'Bekræft din e-mailadresse, før du bedømmer.',
  'rating.comments': 'Kommentarer',
  'rating.noComments': 'Ingen kommentarer endnu.',
  'jobs.search': 'Søg ledige stillinger på dette center',
  'account.passwordHint': 'Mindst {n} tegn.',
  'account.close': 'Luk kontopanelet',
  'account.adminPanel': 'Administration',
  'account.forgot': 'Glemt adgangskode?',
  'reset.title': 'Få en ny adgangskode',
  'reset.why': 'Skriv din e-mailadresse. Er der en konto, sender vi et link til at vælge en ny adgangskode.',
  'reset.send': 'Send link',
  'reset.sent': 'Hvis der er en konto på {email}, er der nu sendt et link. Det udløber om en time.',
  'reset.newTitle': 'Vælg en ny adgangskode',
  'reset.newPassword': 'Ny adgangskode',
  'reset.save': 'Gem adgangskoden',
  'reset.done': 'Adgangskoden er skiftet. Log ind med den nye.',
  'error.bad_email': 'Skriv en gyldig e-mailadresse.',
  'error.too_short': 'Adgangskoden skal være mindst {n} tegn.',
  'error.too_long': 'Adgangskoden er for lang.',
  'error.email_taken': 'Der findes allerede en konto med den e-mail. Log ind i stedet.',
  'error.bad_credentials': 'E-mail eller adgangskode passer ikke.',
  'error.bad_token': 'Linket er brugt eller udløbet. Bed om et nyt.',
  'error.too_many': 'For mange forsøg. Prøv igen om et kvarter.',
  'error.offline': 'Ingen forbindelse til serveren. Prøv igen.',
  'error.server_error': 'Noget gik galt. Prøv igen.',
  'visit.mark': 'Markér som besøgt',
  'visit.unmark': 'Fjern fra besøgte',
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
  'app.subtitle': 'Nationwide',
  'intro.label': 'A short tour',
  'intro.progress': 'Step {n} of {total}',
  'intro.next': 'Next',
  'intro.start': 'Get started',
  'intro.skip': 'Skip',
  'intro.map.title': 'Every care centre on the map',
  'intro.map.body':
    '{n} care centres across all {k} municipalities in Denmark. Search by name, or pick a municipality, and see all of them.',
  'intro.jobs.title': 'Jobs at each centre',
  'intro.jobs.body':
    'Every centre carries a link to the vacancies at that centre — alongside its address, phone number and official website, so you can approach them directly.',
  'intro.saved.title': 'Keep the ones you applied to',
  'intro.saved.body':
    'Create an account, mark the centres you have written to, and leave a note: when you applied, who you spoke to, and what they said.',
  'app.skipToList': 'Skip to the list of care homes',

  'header.toDark': 'Switch to dark theme',
  'header.toLight': 'Switch to light theme',
  'header.language': 'Choose language',
  'header.languageMenu': 'Language',

  'search.label': 'Search by care home, street, postcode or town',
  'search.placeholder': 'Search name, street or postcode',
  'search.clear': 'Clear the search',
  'dock.search': 'Search the map',
  'dock.close': 'Close the search',
  'dock.savedSignedOut': 'Log in to see your saved places',
  'dock.clearFilters': 'Clear the filters and show every care home',

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


  'region.label': 'Part of the country',
  'region.menu': 'Choose a part of the country',
  'region.all': 'Denmark',
  'region.empty': 'None in this edition of the data',
  'region.hint': 'Choose Sjælland, Fyn or Jylland to see one part of the country at a time.',

  'map.label': 'Map of care homes across Denmark',
  'map.zoomIn': 'Zoom in',
  'map.zoomOut': 'Zoom out',
  'map.reset': 'Show the whole area again',
  'map.legend': 'Legend',
  'map.legendTitle': 'Operator',
  'map.legendSaved': 'Saved by you',
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
  'locate.far': 'You are outside the area this map covers. The map still shows where you are.',
  'locate.dismiss': 'Dismiss this message',

  'panel.close': 'Close details for {name}',
  'panel.address': 'Address',
  'panel.ownership': 'Operator',
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
  'live.resetView': 'The map shows the whole area again.',
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
  'note.add': 'Add a note',
  'note.edit': 'Edit note',
  'note.label': 'Your note',
  'note.placeholder': 'When you applied, who you spoke to, what they said.',
  'note.save': 'Save note',
  'note.cancel': 'Cancel',
  'note.saved': 'Note saved.',
  'note.failed': 'The note could not be saved. Try again.',
  'rating.title': 'Ratings',
  'rating.none': 'No ratings yet.',
  'rating.count': { one: '{n} rating', other: '{n} ratings' },
  'rating.outOf': '{n} out of 5',
  'rating.spread': '{stars} stars: {n}',
  'rating.yours': 'Your rating',
  'rating.pick': '{n} out of 5 stars',
  'rating.pickLegend': 'Choose a number of stars',
  'rating.comment': 'Comment (optional)',
  'rating.commentHint': 'Comments are read before they appear.',
  'rating.placeholder': 'For example how the visit went, and what you noticed.',
  'rating.save': 'Save rating',
  'rating.saving': 'Saving …',
  'rating.saved': 'Your rating is saved.',
  'rating.remove': 'Remove my rating',
  'rating.removed': 'Your rating has been removed.',
  'rating.failed': 'The rating could not be saved. Try again.',
  'rating.needStars': 'Choose a number of stars first.',
  'rating.pending': 'Your comment is waiting to be approved and is not shown yet.',
  'rating.approved': 'Your comment has been published.',
  'rating.rejected': 'Your comment was not published. Your rating still counts.',
  'rating.signIn': 'Sign in to rate',
  'rating.unverified': 'Confirm your e-mail address before rating.',
  'rating.comments': 'Comments',
  'rating.noComments': 'No comments yet.',
  'jobs.search': 'Search for vacancies at this centre',
  'account.passwordHint': 'At least {n} characters.',
  'account.close': 'Close the account panel',
  'account.adminPanel': 'Administration',
  'account.forgot': 'Forgotten your password?',
  'reset.title': 'Get a new password',
  'reset.why': 'Enter your e-mail address. If there is an account, we will send a link for choosing a new password.',
  'reset.send': 'Send the link',
  'reset.sent': 'If there is an account for {email}, a link is on its way. It expires in one hour.',
  'reset.newTitle': 'Choose a new password',
  'reset.newPassword': 'New password',
  'reset.save': 'Save the password',
  'reset.done': 'The password has been changed. Sign in with the new one.',
  'error.bad_email': 'Enter a valid email address.',
  'error.too_short': 'The password must be at least {n} characters.',
  'error.too_long': 'That password is too long.',
  'error.email_taken': 'An account with that email already exists. Sign in instead.',
  'error.bad_credentials': 'That email and password do not match.',
  'error.bad_token': 'That link has been used or has expired. Ask for a new one.',
  'error.too_many': 'Too many attempts. Try again in about fifteen minutes.',
  'error.offline': 'Could not reach the server. Try again.',
  'error.server_error': 'Something went wrong. Try again.',
  'visit.mark': 'Mark as visited',
  'visit.unmark': 'Remove from visited',
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
  'app.subtitle': 'در سراسر دانمارک',
  'intro.label': 'راهنمای کوتاه',
  'intro.progress': 'گام {n} از {total}',
  'intro.next': 'بعدی',
  'intro.start': 'شروع کنیم',
  'intro.skip': 'رد کردن',
  'intro.map.title': 'همهٔ مراکز، روی نقشه',
  'intro.map.body':
    '{n} مرکز مراقبت در هر {k} شهرداری دانمارک. با نام جست‌وجو کنید یا یک شهرداری را انتخاب کنید تا همه را ببینید.',
  'intro.jobs.title': 'کار در هر مرکز',
  'intro.jobs.body':
    'روی هر مرکز، پیوند جست‌وجوی آگهی‌های استخدام همان مرکز هست؛ کنار نشانی، تلفن و وب‌سایت رسمی، تا مستقیم با خودشان تماس بگیرید.',
  'intro.saved.title': 'هرجا درخواست دادید، نشان کنید',
  'intro.saved.body':
    'یک حساب بسازید، مراکزی را که به آن‌ها نامه نوشته‌اید نشان کنید و یادداشت بگذارید: چه زمانی، با چه کسی صحبت کردید و چه گفتند.',
  'app.skipToList': 'پرش به فهرست مراکز مراقبت',

  'header.toDark': 'تغییر به پوستهٔ تیره',
  'header.toLight': 'تغییر به پوستهٔ روشن',
  'header.language': 'انتخاب زبان',
  'header.languageMenu': 'زبان',

  'search.label': 'جست‌وجو بر پایهٔ نام مرکز، خیابان، کد پستی یا شهر',
  'search.placeholder': 'جست‌وجوی نام، خیابان یا کد پستی',
  'search.clear': 'پاک کردن جست‌وجو',
  'dock.search': 'جست‌وجو روی نقشه',
  'dock.close': 'بستن جست‌وجو',
  'dock.savedSignedOut': 'برای دیدن جاهای ذخیره‌شده وارد شوید',
  'dock.clearFilters': 'پاک کردن فیلترها و نمایش همهٔ مراکز',

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


  'region.label': 'بخش کشور',
  'region.menu': 'بخشی از دانمارک را انتخاب کنید',
  'region.all': 'دانمارک',
  'region.empty': 'در این نسخه از داده‌ها موردی نیست',
  'region.hint': 'برای دیدن یک بخش از دانمارک، Sjælland، Fyn یا Jylland را انتخاب کنید.',

  'map.label': 'نقشهٔ مراکز مراقبت در سراسر دانمارک',
  'map.zoomIn': 'بزرگ‌نمایی نقشه',
  'map.zoomOut': 'کوچک‌نمایی نقشه',
  'map.reset': 'نمایش دوبارهٔ کل منطقه',
  'map.legend': 'راهنمای نقشه',
  'map.legendTitle': 'نوع اداره',
  'map.legendSaved': 'ذخیرهٔ شما',
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
  'locate.far': 'شما بیرون از محدودهٔ این نقشه هستید. نقشه همچنان موقعیت شما را نشان می‌دهد.',
  'locate.dismiss': 'بستن این پیام',

  'panel.close': 'بستن جزئیات {name}',
  'panel.address': 'نشانی',
  'panel.ownership': 'نوع اداره',
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
  'note.add': 'یادداشت شخصی',
  'note.edit': 'ویرایش یادداشت',
  'note.label': 'یادداشت شما',
  'note.placeholder': 'برای نمونه کِی درخواست دادید، با چه کسی حرف زدید و چه گفتند.',
  'note.save': 'ذخیرهٔ یادداشت',
  'note.cancel': 'انصراف',
  'note.saved': 'یادداشت ذخیره شد.',
  'note.failed': 'یادداشت ذخیره نشد. دوباره تلاش کنید.',
  'rating.title': 'امتیازها',
  'rating.none': 'هنوز امتیازی ثبت نشده است.',
  'rating.count': { one: '{n} امتیاز', other: '{n} امتیاز' },
  'rating.outOf': '{n} از ۵',
  'rating.spread': '{stars} ستاره: {n}',
  'rating.yours': 'امتیاز شما',
  'rating.pick': '{n} از ۵ ستاره',
  'rating.pickLegend': 'تعداد ستاره را انتخاب کنید',
  'rating.comment': 'نظر (اختیاری)',
  'rating.commentHint': 'نظرها پیش از نمایش خوانده می‌شوند.',
  'rating.placeholder': 'مثلاً بازدید چطور بود و چه چیزی توجه شما را جلب کرد.',
  'rating.save': 'ثبت امتیاز',
  'rating.saving': 'در حال ثبت …',
  'rating.saved': 'امتیاز شما ثبت شد.',
  'rating.remove': 'حذف امتیاز من',
  'rating.removed': 'امتیاز شما حذف شد.',
  'rating.failed': 'امتیاز ثبت نشد. دوباره تلاش کنید.',
  'rating.needStars': 'ابتدا تعداد ستاره را انتخاب کنید.',
  'rating.pending': 'نظر شما در انتظار تأیید است و هنوز نمایش داده نمی‌شود.',
  'rating.approved': 'نظر شما منتشر شد.',
  'rating.rejected': 'نظر شما منتشر نشد. امتیاز شما همچنان محاسبه می‌شود.',
  'rating.signIn': 'برای امتیاز دادن وارد شوید',
  'rating.unverified': 'پیش از امتیاز دادن نشانی ایمیل خود را تأیید کنید.',
  'rating.comments': 'نظرها',
  'rating.noComments': 'هنوز نظری ثبت نشده است.',
  'jobs.search': 'جست‌وجوی آگهی‌های استخدام این مرکز',
  'account.passwordHint': 'دست‌کم {n} نویسه.',
  'account.close': 'بستن پنل حساب',
  'account.adminPanel': 'مدیریت',
  'account.forgot': 'گذرواژه را فراموش کرده‌اید؟',
  'reset.title': 'گذرواژهٔ تازه',
  'reset.why': 'نشانی ایمیل خود را بنویسید. اگر حسابی وجود داشته باشد، پیوندی برای انتخاب گذرواژهٔ تازه می‌فرستیم.',
  'reset.send': 'فرستادن پیوند',
  'reset.sent': 'اگر حسابی با {email} باشد، پیوند فرستاده شد. تا یک ساعت معتبر است.',
  'reset.newTitle': 'گذرواژهٔ تازه را انتخاب کنید',
  'reset.newPassword': 'گذرواژهٔ تازه',
  'reset.save': 'ذخیرهٔ گذرواژه',
  'reset.done': 'گذرواژه عوض شد. با گذرواژهٔ تازه وارد شوید.',
  'error.bad_email': 'یک نشانی ایمیل درست بنویسید.',
  'error.too_short': 'گذرواژه باید دست‌کم {n} نویسه باشد.',
  'error.too_long': 'این گذرواژه بیش از اندازه بلند است.',
  'error.email_taken': 'حسابی با این ایمیل از پیش هست. به جای آن وارد شوید.',
  'error.bad_credentials': 'ایمیل و گذرواژه با هم نمی‌خوانند.',
  'error.bad_token': 'این پیوند استفاده شده یا منقضی است. پیوند تازه بخواهید.',
  'error.too_many': 'تلاش بیش از اندازه. حدود پانزده دقیقه دیگر دوباره تلاش کنید.',
  'error.offline': 'دسترسی به سرور ممکن نشد. دوباره تلاش کنید.',
  'error.server_error': 'خطایی رخ داد. دوباره تلاش کنید.',
  'visit.mark': 'نشان کردن به‌عنوان بازدیدشده',
  'visit.unmark': 'برداشتن از بازدیدشده‌ها',
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
