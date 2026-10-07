# Søgning, kalender og fællesskab

Implementeret oven på den eksisterende Circle-app. Dansk og svensk brugerflade; eksisterende Firebase- og Stripe-projekt bevares.

## Funktioner 1–8

1. **Gæsteadgang:** Forsiden og annoncevisning er tilgængelige uden konto. Login kræves for forespørgsler, favoritter, egne annoncer, kort, lån og konto. En ubekræftet konto bruger fortsat e-mailbekræftelsesflowet.
2. **Samlet søgning:** Tekst, postområde/radius, kategori, land, pris og datoer filtrerer annoncerne. Start- og slutdag tæller med i kalenderdagsprisen; depositum vises separat. Ukendt/fejlende tilgængelighed behandles aldrig som ledig.
3. **Kalender:** Annoncen viser optagede datoer. Under Mine ting åbner ejeren Kalender og kan blokere egne perioder eller frigive dem igen. Bookinggodkendelse, private blokeringer og godkendte forlængelser bruger samme atomiske versionslås pr. annonce. Forespørgsler reserverer først datoerne, når ejeren godkender.
4. **Anmeldelser:** Efter afsluttet retur kan hver part skrive én vurdering (1–6) og højst 600 tegn om modparten. Begge ser aftalens anmeldelser; vurderinger af ejeren vises ved annoncen med fornavn, dato og samlet gennemsnit. API'en udleder modtager og forfatter fra den rigtige aftale/konto.
5. **Favoritter og gemte søgninger:** Hjertet gemmer favoritter på kontoen. Op til 20 søgninger og 100 favoritter. Gemte søgninger omfatter filtre og postområde, ikke datoer. Beskeder om nye match vælges særskilt. Nye match vises i Circle; push kræver den særskilte push-opsætning.
6. **Kategorifelter:** Fx lasteevne/mål/stik for trailer, model/strøm/tilbehør for værktøj og størrelse/type/tilbehør for cykler. Serveren tillader kun kategoriens felter, højst 200 tegn pr. felt.
7. **Tidspunkter og forlængelse:** Nye forespørgsler angiver afhentnings- og returtid, lokal tid i Danmark/Sverige. Godkendelse af forespørgslen omfatter tiderne. Hver part kan foreslå en senere slutdato. Den anden konto skal godkende den nye dato, returtid og serverberegnede totalpris. Aftalt dagspris og depositum bevares. Højst ti forlængelser, ingen ændring efter første returunderskrift. Originale vilkår/signaturer bevares, og godkendelser gemmes som tillæg, også på udskriften. En underskrift fra en forældet visning afvises efter forlængelse.
8. **Jeg søger:** Egen side via menuen og knap på forsiden. Højst fem aktive efterlysninger pr. konto, synlige højst 30 dage eller til ønsket slutdato. Fornavn og postområde vises. Andre kan foreslå en af deres aktive annoncer; svar er kun synlige for opslagets ejer. En egentlig aftale oprettes fortsat via annonceforespørgslen. Ejeren kan lukke efterlysningen.

## Drift og data

- Server-only collections: `listingCalendars`, `bookingLocks`, `circlePreferences`, `reviews`, `wanted`, `wantedLocks`.
- Eksisterende servicekonto anvendes. Ingen nye hemmeligheder eller miljøvariabler kræves for 1–8.
- De eksplicitte deny-regler dokumenterer adgangen. Eksisterende regler afviser allerede disse nye collections som standard. Annoncernes eksisterende offentlige læsning bevares.
- API'er returnerer `no-store`; ingen persondata føjes til offline-cache.
- Forespørgsler bruger eksisterende enkeltfeltsindekser (`item.id`, `listingId`, `agreementId`, `ownerUid`, `country`, `subjectUid` efter behov). Ingen nye sammensatte indeks kræves.
- Efterlysningers udløb skjuler dem; det er **ikke fysisk sletning**. Anmeldelser og gemte søgninger har ikke automatisk TTL. Ejerens senere slette-/opbevaringspolitik skal omfatte disse collections; ingen eksisterende data slettes i denne ændring.
- Push er fortsat valgfrit og kræver trinene i `PUSH_SETUP.md`. Der sendes kun en generisk tekst ved nye annoncer, kun til konti med en matchende søgning og tilvalgte beskeder. Ingen besked ved almindelig annonceredigering, og ejeren får ikke besked om sin egen annonce.
- Push leveres efter lagringen via Next `after`, uden varig jobkø. Ved større trafik bør matchning og levering flyttes til en holdbar baggrundskø; søgeresultaterne i Circle er ikke afhængige af push.
- Offentlige visninger er dataminimerede: kalenderen viser kun datoer; anmeldelser viser ikke UID/ticket/kontaktoplysninger; efterlysninger viser ikke adresse/telefon. Brugernes fritekst er offentlig, hvilket fremgår ved indtastning. Moderationsværktøjer er en separat fremtidig opgave.

## Verifikation

`npm test` bygger appen og kører 108 tests. Nye handler-tests bruger en Firestore REST-testdouble med atomiske versionsforudsætninger, ikke produktionsdata. De dækker kalenderprivatliv, ejerskab, samtidige blokeringer/bookinger/forlængelser, anmelderadgang, favorit-/søgningsisolering, kategorifelter, tidsvalidering, historik og efterlysningsgrænser. TypeScript og ESLint kontrolleres særskilt; eksisterende Next img-advarsler er bevaret.

Fysisk test på iPhone/iPad/Android og to rigtige konti, inklusive push og udskrift med lange tillæg, skal gennemføres som ejerens accepttest. Automatiske tests bekræfter ikke fysisk levering af notifikationer eller en bestemt printers sidetal.

## Kontaktoplysninger kræver godkendelse

Nye forespørgsler gemmes uden privat adresse, telefon eller e-mail fra nogen af parterne. Ejeren frigiver serverhentede kontaktoplysninger atomisk sammen med godkendelsen. En generel annonceforespørgsel kan ikke hente en anden brugers kontaktoplysninger. API-læsning og idempotente genforsøg skjuler også oplysninger i ældre, endnu ikke godkendte aftaler.

**Påkrævet Firebase-trin:** Publicér den opdaterede `firestore.rules`. Direkte browserlæsning af selve `agreements`-dokumentet afvises nu; appen bruger allerede server-API'en. Beskeders deltagersikrede læsning bevares. Dette er nødvendigt for at lukke direkte Firestore-adgang til kontaktoplysninger i ældre, ikke godkendte aftaler. En Netlify-deploy publicerer ikke Firestore-regler.

Ejerens CLI-kommando i dette repo efter Firebase-login:

```sh
firebase deploy --only firestore:rules --project veyro-circle
```

Alternativt: Firebase Console → Veyro Circle → Firestore Database → Rules. Erstat med hele repoets `firestore.rules`, gennemse og vælg Publish. Deploy kræver projektejerens Firebase-adgang; ingen servicenøgler skal deles i chatten.

Sprogknappen skifter straks og gemmer kun `preferredLanguage` via en autentificeret PATCH. Profilindlæsningen afhænger ikke længere af sproget og overskriver derfor ikke brugerens nye valg.

## Abonnementsmodel (opdateret)

Søgning og forespørgsler er gratis. Annoncer kræver Circle Plus fra første ting: 49 DKK/måned i Danmark eller 69 SEK/måned i Sverige, op til 20 aktive ting. Stripe bruger fortsat `STRIPE_PRICE_DKK` og `STRIPE_PRICE_SEK`; ingen pris eller abonnement ændres hos Stripe i denne kodeændring.

Serveren afviser oprettelse/redigering og godkendelse af nye udlån uden ejerens Plus-adgang. Grænsen på 20 håndhæves med atomisk ejerlås, også ved samtidige oprettelser. Låneren behøver ikke abonnement. Offentligt annoncefeed henter ejerens abonnementsstatus på serveren og skjuler ikke-betalende ejeres annoncer. Ejeren kan stadig se og slette sine gemte ting under Mine ting; ingen eksisterende ting slettes. Allerede indgåede aftaler og returunderskrifter forbliver tilgængelige. Feedet opdateres ved ændringer/fokus og hvert 15. sekund, mens siden er synlig.

Anmeldelser af udlåneren samles på tværs af dennes annoncer og vises nederst i annoncevisningen med stjerner, kommentar, fornavn og dato. Nye anmeldelser gemmes med `maxStars:6`; eksisterende femstjernede anmeldelser bevarer den oprindelige skala og normaliseres kun ved beregning af seksstjernet gennemsnit.
