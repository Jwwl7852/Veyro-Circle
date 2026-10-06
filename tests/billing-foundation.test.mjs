import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Stripe checkout requires verified Firebase identity and server-selected country price", async () => {
  const checkout = await readFile(new URL("../app/api/stripe/checkout/route.ts", import.meta.url), "utf8");
  assert.match(checkout, /verifyFirebaseRequest/);
  assert.match(checkout, /getServerProfile/);
  assert.match(checkout, /STRIPE_PRICE_SEK/);
  assert.match(checkout, /STRIPE_PRICE_DKK/);
  assert.doesNotMatch(checkout, /request\.json\(\).*country/s);
});

test("Stripe webhook verifies its signature before changing Firestore", async () => {
  const webhook = await readFile(new URL("../app/api/stripe/webhook/route.ts", import.meta.url), "utf8");
  const stripe = await readFile(new URL("../lib/stripe-server.ts", import.meta.url), "utf8");
  assert.match(webhook, /verifyStripeWebhook/);
  assert.match(stripe, /STRIPE_WEBHOOK_SECRET/);
  assert.match(stripe, /HMAC/);
  assert.match(stripe, /Math\.abs/);
});

test("client cannot assign Stripe ownership or subscription status", async () => {
  const rules = await readFile(new URL("../firestore.rules", import.meta.url), "utf8");
  for (const field of ["subscriptionStatus","stripeCustomerId","stripeSubscriptionId"]) assert.match(rules, new RegExp(field));
});
