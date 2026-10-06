# Stripe Billing til Veyro Circle

Veyro Circle bruger Stripe Checkout til Circle Plus-abonnementer. Det er almindelig Stripe Billing. Stripe Connect skal først tilføjes, hvis Circle senere skal formidle betaling mellem udlejer og lejer.

## Stripe Dashboard

1. Opret produktet **Veyro Circle Plus**.
2. Opret en månedlig pris på **49 DKK** og en månedlig pris på **69 SEK**.
3. Kopiér pris-ID'erne (`price_...`) til `STRIPE_PRICE_DKK` og `STRIPE_PRICE_SEK`.
4. Aktivér Customer Portal med mulighed for kortændring, fakturahistorik og opsigelse ved periodens udløb.
5. Opret webhook-endpointet `https://veyro-circle-app.bccrtz64hk.chatgpt.site/api/stripe/webhook`.
6. Vælg hændelserne `checkout.session.completed`, `customer.subscription.updated` og `customer.subscription.deleted`.
7. Kopiér webhookens signing secret (`whsec_...`) til `STRIPE_WEBHOOK_SECRET`.
8. Gem Stripes secret key (`sk_test_...` under test og senere `sk_live_...`) som `STRIPE_SECRET_KEY` i hostingmiljøet — aldrig i Git eller klientkode.

Start med Stripe Test Mode. Gennemfør registrering, e-mailbekræftelse, køb, portalbesøg og opsigelse, før live-nøgler indsættes.

## Firebase-serveradgang

Webhooks opdaterer abonnementet i Firestore via en begrænset servicekonto. Gem servicekontoens e-mail og private key som `FIREBASE_SERVICE_ACCOUNT_EMAIL` og `FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY` i hostingmiljøet. Hele servicekonto-JSON-filen må ikke committes.
