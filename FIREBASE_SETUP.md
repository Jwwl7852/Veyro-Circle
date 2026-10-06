# Firebase-opsætning til Veyro Circle

1. Opret et **nyt, separat** Firebase-projekt til Veyro Circle. Genbrug ikke FormPilot, FleetControl eller andre Veyro-projekter.
2. Tilføj en webapp i Firebase Console, og kopiér de seks offentlige værdier fra web-konfigurationen til en lokal `.env.local` ud fra `.env.example`.
3. Under Authentication → Sign-in method: aktivér **Email/Password**. Tilføj produktionsdomænet under Authorized domains.
4. Opret Cloud Firestore i den ønskede EU-region og Firebase Storage i samme relevante region.
5. Installer Firebase CLI, log ind som projektejer, vælg det nye projekt og deploy reglerne: `firebase deploy --only firestore:rules,storage`.
6. Tilpas Authentication → Templates for bekræftelsesmail og nulstilling af adgangskode på dansk/svensk og kontrollér afsender/domæne.
7. Indsæt de samme seks `NEXT_PUBLIC_FIREBASE_*` værdier som miljøvariabler i Netlify. De er klientkonfiguration, ikke servicekontonøgler. Læg aldrig servicekonto, Admin SDK-private keys eller `.env.local` i Git.
8. Test registrering, bekræftelsesmail, login, nulstilling, profilgemning og log ud med en testbruger i både dansk og svensk.

Firestore-profiler bruger dokumentstien `users/{Firebase UID}`. Profilen oprettes gennem den serverbeskyttede `/api/profile`-rute, som kontrollerer normaliseret telefonnummer og kombinationen af navn, adresse og telefonnummer. De interne kontrolsamlinger indeholder kun HMAC-fingeraftryk og kan ikke læses eller skrives fra browseren. Klienten kan heller ikke selv ændre roller, verificeringsstatus, abonnement eller ejerskab.

Gemte låne- og lejeaftaler får feltet `retentionUntil` sat 12 måneder frem. Aktivér Firestore TTL for samlingen `agreements` med feltet `retentionUntil`. Appen skjuler allerede udløbne aftaler, mens TTL sørger for automatisk sletning efter perioden.
