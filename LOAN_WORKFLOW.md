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

### Tydeligt aftaleforløb

Aftalevisningen viser fire trin: forespørgsel, udlevering, i brug og tilbagelevering. En personlig besked forklarer næste handling og navngiver den anden part, når dennes underskrift mangler. Genveje flytter tastaturfokus og visning til den relevante note. Forløbet medtages ikke i udskriften og ændrer ikke aftalens data eller underskriftsregler.

Aftaler uden to forskellige tilknyttede UID'er markeres som ikke digitalt gennemførlige (mulig gammel prøveaftale), ikke som beviseligt demo. Afviste/annullerede og afsluttede aftaler får en afslutningsbesked. Før godkendelse forklarer udleveringsnoten korrekt, at ejerens godkendelse mangler, frem for at bede om underskrifter først. Mobilvisning bruger to trin pr. række; dansk/svensk, statusafledning og HTML-semantik testes automatisk.

- Klokken viser seneste aktivitet pr. aftale plus påmindelser om udleveringsunderskrift, afhentningsdato og retur. Dette er ikke en komplet hændelseslog; en nyere aktivitet erstatter den tidligere aktivitetsnotifikation.
- Læst-status gemmes pr. UID i aftalen. En læsekvittering gælder kun det viste notifikations-ID, ikke en nyere hændelse. Klienten kan ikke vælge modtager, afsender eller ændre en anden brugers læst-status.
- Nye chatbeskeder og aktivitetsmarkering gemmes atomisk gennem API'et. Den eksisterende chatvisning modtager stadig beskeder via Firestore-listener. Gamle klienter, der skriver direkte via de eksisterende chatregler, skaber ikke nye aktivitetsmarkeringer; genindlæs appen efter deploy.
- Overblik og klokke opdateres hvert 15. sekund, når fanen er synlig, samt ved fokus og egne handlinger. Fejl vises uden at erstatte tidligere hentede aftaler med en tom liste. Private svar har `Cache-Control: private, no-store`.
- Påmindelser er **kun i appen**, mens den bruges. Ingen baggrundspush, SMS eller e-mail er aktiveret. E-mail kræver valg af udbyder, verificeret afsenderdomæne, serverhemmeligheder og en separat kø/scheduler med retry og deduplikering. Firebase Auths bekræftelsesmail er ikke en generel mailafsender.
- Bookinglås er server-only. Den tilføjede eksplicitte regel svarer til den hidtidige standardafvisning af ukendte collections; ingen ny klientadgang kræves. Brug eksisterende Firebase-servicekonto og projektkonfiguration. Ingen nye hemmeligheder.
- Eksisterende opbevaringsgrænse filtrerer aftaler efter 12 måneder fra oprettelse. Dette er ikke en ny fysisk slette-/TTL-mekanisme. Ved stor trafik bør overblik pagineres og notifikationer flyttes til et særskilt letvægtsindeks frem for gentagne fulde aftalelæsninger.

## Verifikation før lancering

### Private billeder ved udlevering og tilbagelevering

- Valgfrit højst to billeder pr. fase. Begge parter kan uploade; kun uploader kan fjerne sit eget billede inden første underskrift. Kamera og filvælger understøttes. JPG/PNG/WEBP (ikke HEIC) op til 12 MB komprimeres med eksisterende billedkomprimering til højst 1600 px og 900 KB. Serveren dekoder JPEG med Sharp, kontrollerer størrelse og genkoder uden EXIF/GPS.
- Billeder ligger under `agreement-evidence/{ticket}/{phase}/{uuid}.jpg` i den eksisterende Circle Storage-bucket. Metadata (ID, uploader, tid, størrelse, dimensioner) ligger i aftalens `handoverPhotos`/`returnPhotos`. Ingen offentlige downloadtokens, signed URLs eller billeder i Firestore. Serveren bygger selv objektstien. Storage-regler afviser direkte klientadgang, som ukendte stier allerede gør i de eksisterende regler.
- Den eksisterende servicekonto bruges med en særskilt cachet `devstorage.read_write`-token; eksisterende Firestore-token beholder `datastore`-scope. **Ingen IAM-rettigheder eller Firebase-indstillinger ændres automatisk.** `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` skal være sat i Netlify. Kontoen skal have `storage.objects.create/get/delete` til Circle-bucketens `agreement-evidence/`-prefix. Hvis det ikke allerede er tilladt, skal ejeren godkende en snævert afgrænset IAM-tildeling; appen viser en fejl og foregiver ikke, at billedet blev gemt. Bucket og standard-objektadgang må ikke give `allUsers`/`allAuthenticatedUsers` adgang. Offentlig adgang til annoncebilleder via Firebase-regler er separat fra bucket-IAM.
- Læsning kræver verificeret Firebase-login og et serverlagret borrower/lender-UID. API'et kontrollerer aftalen ved hver læsning, inkl. at billed-ID stadig er knyttet til fasen og at opbevaringsperioden ikke er udløbet. Svar er `private, no-store`; browseren bruger kortlivede blob-URLs, som frigives ved lukning. Next billedoptimering omgås bevidst, så ingen billedproxy/cache får private billeder.
- Før signering indlæses billederne, og brugeren markerer at have gennemgået dem. Signeringsrequest medsender billed-ID'erne; serveren sammenligner med aktuelle IDs og gemmer dem på underskriften. Gamle klienter kan kun underskrive en fase uden billeder. Et nyt billede eller fjernelse af et billede gør en ældre billedgodkendelse ugyldig.
- Metadata, underskrifter og noter anvender samme Firestore-versionskontrol. Upload gemmes med et nyt uoverskriveligt UUID-objekt, derefter kobles metadata atomisk til den læste aftaleversion. En definitiv konflikt rydder uploaden op. Fjernelse frakobler først billedet med versionskontrol og sletter derefter objektet. En underskrift kan derfor ikke races til at godkende andre billeder eller få dem slettet.
- Netværksfejl efter et tvetydigt commit må **ikke** slette muligvis signeret dokumentation. Det kan efterlade et privat, utilgængeligt objekt; mislykket oprydning logges uden persondata. Der er endnu ingen automatisk fysisk oprydning af forældreløse eller udløbne objekter. En separat, ejer-godkendt retention-/oprydningsjob skal etableres før større drift; brug ikke en bred bucket-livscyklusregel, der også sletter aktive annoncebilleder. Den eksisterende 12-måneders adgangsgrænse er ikke en fysisk sletningsgaranti.
- Print beholder den kompakte aftale: galleriet udelades og erstattes af antal billeder/fase og henvisning til samme ticket digitalt. Ingen private billeder indlejres i printvinduet. Ingen gamle aftaler eller underskrifter migreres/slettes.

Manuel fototest efter deploy: Brug to verificerede konti og én accepteret testforespørgsel. Upload fra hver mobil, genåbn hos modparten, forstør billedet og gennemgå det. Signér først fra én konto og kontrollér at begge konti nu er låst for upload/fjernelse i fasen. Gentag ved returnering. Kontroller fejl ved afbrudt netværk, en ikke-deltagers adgang, svensk tekst og én-sides print. Testene i repository bruger en Storage/Firestore-testdouble og beviser ikke produktions-IAM eller kamerafunktion i Safari.

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
