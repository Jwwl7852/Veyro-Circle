# Stripe Billing til Veyro Circle

Veyro Circle bruger Stripe Checkout til Circle Plus-abonnementer. Det er almindelig Stripe Billing. Stripe Connect skal først tilføjes, hvis Circle senere skal formidle betaling mellem udlejer og lejer.

## Stripe Dashboard

1. Opret produktet **Veyro Circle Plus**.
2. Opret en månedlig pris på **49 DKK** og en månedlig pris på **69 SEK**.
3. Kopiér pris-ID'erne (`price_...`) til `STRIPE_PRICE_DKK` og `STRIPE_PRICE_SEK`.
4. Aktivér Customer Portal med mulighed for kortændring, fakturahistorik og opsigelse ved periodens udløb.
5. Opret webhook-endpointet `https://veyro-circle.netlify.app/api/stripe/webhook`.
6. Vælg hændelserne `checkout.session.completed`, `customer.subscription.updated` og `customer.subscription.deleted`.
7. Kopiér webhookens signing secret (`whsec_...`) til `STRIPE_WEBHOOK_SECRET`.
8. Gem Stripes secret key (`sk_test_...` under test og senere `sk_live_...`) som `STRIPE_SECRET_KEY` i hostingmiljøet — aldrig i Git eller klientkode.

Start med Stripe Test Mode. Gennemfør registrering, e-mailbekræftelse, køb, portalbesøg og opsigelse, før live-nøgler indsættes.

## Skift fra test til salg

Stripe holder testdata og livedata adskilt. Testkunder, testbetalinger og testabonnementer skal derfor ikke slettes for at åbne salget; de vises ikke i live-tilstand.

Når virksomhedens Stripe-konto er aktiveret til livebetalinger:

1. Slå **Test mode** fra i Stripe Dashboard.
2. Opret Circle Plus-produktet og de to månedlige priser på ny i live-tilstand.
3. Opret live-webhooken til `https://veyro-circle.netlify.app/api/stripe/webhook` med de tre hændelser ovenfor.
4. Udskift kun disse fire værdier i Netlify:
   - `STRIPE_SECRET_KEY` med `sk_live_...`
   - `STRIPE_WEBHOOK_SECRET` med live-webhookens `whsec_...`
   - `STRIPE_PRICE_DKK` med live-prisen i DKK
   - `STRIPE_PRICE_SEK` med live-prisen i SEK
5. Udløs en ny Netlify-deploy og gennemfør ét rigtigt køb og én opsigelse med et lille, kontrolleret beløb.

Firebase-værdierne skal ikke ændres ved dette skift. Test- og liveværdier må aldrig blandes; en testpris kan ikke bruges med en live secret key.

## Firebase-serveradgang

Webhooks opdaterer abonnementet i Firestore via en begrænset servicekonto. Gem servicekontoens e-mail og private key som `FIREBASE_SERVICE_ACCOUNT_EMAIL` og `FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY` i hostingmiljøet. Hele servicekonto-JSON-filen må ikke committes.
