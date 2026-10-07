# Forespørgsler, notifikationer og låneoverblik

## Adfærd

- Send forespørgsel gemmer straks i Firestore til begge deltagere. Ticket genbruges ved retry fra samme åbne formular. Serveren henter identitet, ejer og pris fra egne dokumenter, ikke fra klientfelter.
- Ejeren godkender eller afviser. Deltagere kan annullere indtil første udleveringsunderskrift. Afviste/annullerede dokumenter bevares i arkivet; en ny forespørgsel kræves for andre datoer/vilkår.
- Godkendelse reserverer inklusive kalenderdage. To samtidige godkendelser for samme ting kan ikke begge gennemføres: API læser en `bookingLocks/{listingId}`-version før overlapforespørgslen og skriver lås og aftale atomisk med versionskontrol. Ved konflikt skal brugeren opdatere/prøve igen. Kun godkendte eller allerede underskrevne aftaler reserverer datoer.
- Datoformularen viser reserverede perioder. Kun datoer udleveres til andre brugere, ikke ticket, parter eller kontaktoplysninger. Accept kontrolleres altid på serveren, også hvis kalenderen er forældet.
- Begge udleveringsunderskrifter giver status Udleveret. Begge returunderskrifter giver Tilbageleveret/afsluttet. Underskrifter anvender serverens tidsstempel og kontrollerer, at den viste note stadig er den aktuelle. Noter låses efter første underskrift som før.
- Gamle gemte aftaler bevares. Gamle aftaler med mindst én udleveringsunderskrift regnes som godkendte; gamle usignerede aftaler kræver ejerens godkendelse. Der foretages ingen masseopdatering eller sletning.
- Mine lån: Jeg låner/Jeg udlåner, aktuelle/arkiv, søgning efter genstand, navn eller ticket og næste handling. Returkvittering, print og 12-måneders visning bevares.

## Notifikationer og drift

- Klokken viser seneste aktivitet pr. aftale plus påmindelser om udleveringsunderskrift, afhentningsdato og retur. Dette er ikke en komplet hændelseslog; en nyere aktivitet erstatter den tidligere aktivitetsnotifikation.
- Læst-status gemmes pr. UID i aftalen. En læsekvittering gælder kun det viste notifikations-ID, ikke en nyere hændelse. Klienten kan ikke vælge modtager, afsender eller ændre en anden brugers læst-status.
- Nye chatbeskeder og aktivitetsmarkering gemmes atomisk gennem API'et. Den eksisterende chatvisning modtager stadig beskeder via Firestore-listener. Gamle klienter, der skriver direkte via de eksisterende chatregler, skaber ikke nye aktivitetsmarkeringer; genindlæs appen efter deploy.
- Overblik og klokke opdateres hvert 15. sekund, når fanen er synlig, samt ved fokus og egne handlinger. Fejl vises uden at erstatte tidligere hentede aftaler med en tom liste. Private svar har `Cache-Control: private, no-store`.
- Påmindelser er **kun i appen**, mens den bruges. Ingen baggrundspush, SMS eller e-mail er aktiveret. E-mail kræver valg af udbyder, verificeret afsenderdomæne, serverhemmeligheder og en separat kø/scheduler med retry og deduplikering. Firebase Auths bekræftelsesmail er ikke en generel mailafsender.
- Bookinglås er server-only. Den tilføjede eksplicitte regel svarer til den hidtidige standardafvisning af ukendte collections; ingen ny klientadgang kræves. Brug eksisterende Firebase-servicekonto og projektkonfiguration. Ingen nye hemmeligheder.
- Eksisterende opbevaringsgrænse filtrerer aftaler efter 12 måneder fra oprettelse. Dette er ikke en ny fysisk slette-/TTL-mekanisme. Ved stor trafik bør overblik pagineres og notifikationer flyttes til et særskilt letvægtsindeks frem for gentagne fulde aftalelæsninger.

## Verifikation før lancering

`npm test` kører produktionsbuild/typecheck og Node-tests. De nye API-tests bruger en Firestore REST-testdouble med atomisk versionskontrol; de bruger **ikke** produktionsdata og erstatter ikke en integrationstest mod Firebase.

Manuel accepttest med to verificerede testkonti i det korrekte Firebase-projekt:

1. Låner sender forespørgsel; genindlæs. Ticket skal stadig findes hos begge.
2. Ejer åbner klokken/ Jeg udlåner. Kontrollér læst-status efter genindlæsning.
3. Godkend én periode; forsøg at godkende en overlappende forespørgsel. Kun én må lykkes. Kontrollér også samtidige klik på to enheder.
4. Afvis en anden forespørgsel; kontrollér arkivet hos begge.
5. Udveksl chatbeskeder, godkend tilstandsnote og underskriv fra hver konto. Låner må ikke underskrive som ejer.
6. Kontrollér at en gammel åben noteversion ikke kan underskrives, og at annullering efter første underskrift afvises.
7. Underskriv retur fra begge. Kontrollér arkiv, print og datoer på mobil og desktop, dansk og svensk.
8. Kontrollér ved 200 % tekststørrelse og på Safari/Chrome, at knapper, modaler og oversigt ikke flytter platformens spalter eller går uden for skærmen.

Netlify deployer som hidtil fra GitHub. Ingen Stripe-indstillinger eller eksisterende abonnementer ændres af denne milepæl.
