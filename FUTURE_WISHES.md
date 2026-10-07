# Fremtidige ønsker

## SMS-bekræftelse og beskyttelse mod genoprettelse

Noteret 7. oktober 2026. Status: udskudt efter ejerens ønske — må ikke implementeres eller aktiveres nu.

- Bekræft telefonnummer med SMS, og begræns samme bekræftede nummer til én konto.
- Understøt senere administratorsuspendering, genåbning og kontrol af forsøg på genoprettelse efter udelukkelse.
- Gem hændelser i en beskyttet Firestore-log: konto-ID, tidspunkt, hændelsestype, resultat og maskeret telefonnummer. Registrér administrator og begrundelse ved administrative handlinger.
- Gem aldrig SMS-koder i loggen. Undgå at logge fulde telefonnumre.
- Overvej en separat serverberegnet, nøglebeskyttet kontrolværdi for telefonnummeret til genkendelse af udelukkede konti.
- Kun autoriserede administratorer må læse loggen; klienten må ikke kunne ændre den.
- Aftal opbevaringsperiode, automatisk sletning, adgangsregler og privatlivsinformation før implementering.
- Samme adresse alene må ikke blokere legitime brugere i samme husstand. Nyt telefonnummer kan stadig omgå kontrollen; SMS er ikke sikker identitetsverifikation.
- Afklar SMS-udbyder, omkostninger, misbrugsbeskyttelse og håndtering af skiftede/genbrugte telefonnumre før udvikling.

Ingen ændringer til login, SMS-afsendelse, betaling eller brugeradgang er bestilt som del af denne note.
