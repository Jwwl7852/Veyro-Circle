# Mobilnotifikationer

Implementeret til web-push på Android-mobil/tablet og understøttede desktopbrowsere samt iPhone/iPad som hjemmeskærmsapp fra iOS/iPadOS 16.4. Ingen App Store/Google Play-pakke er nødvendig. Brugerens og operativsystemets tilladelse kræves på hver enhed.

## Aktivering af ejeren

1. Åbn Firebase-projektet **veyro-circle**, Projektindstillinger → Cloud Messaging.
2. Kontrollér, at Firebase Cloud Messaging API (HTTP v1) og FCM Registration API er aktiveret for dette projekt.
3. Under Web Push certificates genereres et nøglepar. Kopiér den **offentlige** VAPID-nøgle til Netlify-miljøvariablen `NEXT_PUBLIC_FIREBASE_VAPID_KEY`. Ingen privat VAPID-nøgle skal kopieres ind i kildekoden.
4. Den eksisterende server-servicekonto skal have tilladelsen `cloudmessaging.messages.create` i Circle-projektet. Brug en afgrænset rolle eller Firebase Cloud Messaging API Admin. Del ikke servicekontoens private nøgle i chat eller Git.
5. Sæt `CIRCLE_PUSH_ENABLED=true` i Netlify Functions-miljøet. Den offentlige nøgle skal også være tilgængelig under build. Deploy igen. Uden aktivering viser UI en ærlig besked og beder ikke om tilladelse.
6. Publicér `firestore.rules`. `pushDevices` er server-only; eksisterende default deny beskytter allerede ukendte samlinger.
7. Aktivér Firestore TTL på `pushDevices.expiresAt`. Serveren sender aldrig til udløbne registreringer, selv før fysisk TTL-sletning. Registreringer fornyes ved åbning af Circle og udløber efter 30 dage uden fornyelse.
8. Gennemfør testen nedenfor, før funktionen meldes aktiv.

## Brug

Åbn klokken → **Slå push til på denne enhed**. På Android bruges en browser med web-push, eksempelvis Chrome; installering på hjemmeskærmen er valgfri. På iPhone/iPad: Del → Føj til hjemmeskærm, åbn Circle derfra og aktivér push. Afvist tilladelse ændres i browser-/systemindstillinger. Batterisparetilstand, Fokus og netværk kan forsinke notifikationer.

## Adfærd og sikkerhed

- Serveren sender til annonceejeren efter en ny gemt forespørgsel og til modparten efter en ny gemt chatbesked. Klienten kan ikke vælge modtager eller sende vilkårlig push. Idempotente retries af samme handling sender ikke igen.
- Kun bekræftede, loggede konti registrerer enheder. Token lagres server-only med UID, sprog, opdateringstid og udløbstid. SHA-256 af token er dokument-ID. Ingen token eller chattekst logges.
- Låseskærmen viser en generisk DA/SV-besked. Ticketlink åbnes på samme origin og kræver normal login og adgang til aftalen. Ingen navne, adresser eller beskedtekster sendes til FCM.
- Framelding og logout fjerner token; serverpost slettes, når forbindelsen tillader det. Kontoændring kræver ny tilmelding. Gamle ugyldige tokens fjernes ved FCM UNREGISTERED.
- Service worker viser data-push uden at cache persondata. Der sendes ikke automatisk push for gamle beskeder, daglige påmindelser eller eksisterende underskrifter i denne fase.
- Levering er best effort og forsøges efter gemningen via Next.js `after`, så en langsom push-tjeneste ikke forsinker svaret på gemningen. Ingen varig retry-kø er implementeret. Nedbrud mellem gemning og afsendelse kan give manglende push; beskeder og forespørgsler bevares og vises i Circle. Et push-svigt må ikke få en gemt aftale til at fremstå som fejlet.

## Test med rigtige enheder (kræver aktivering)

To separate konti og enheder: Android-mobil, Android-tablet og iPhone/iPad hjemmeskærmsapp. Aktivér fra klokken, luk Circle, send forespørgsel og chat fra den anden konto, kontrollér notifikation og korrekt ticket/samtale ved tryk. Gentag med Circle i forgrunden. Afvis tilladelse, slå push fra, log ud og skift konto; ingen nye notifikationer til den gamle konto må dukke op. Genåbn enheden og kontrollér fornyelse. Test også dansk/svensk, manglende opsætning og afbrudt netværk. Automatiske tests bruger simuleret Firebase/FCM og erstatter ikke denne enhedstest.

Kilder: https://firebase.google.com/docs/cloud-messaging/web/get-started og https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
