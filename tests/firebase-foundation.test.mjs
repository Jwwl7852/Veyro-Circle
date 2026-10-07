import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Firebase example lists every required public web variable", async () => {
  const env = await readFile(new URL("../.env.example", import.meta.url), "utf8");
  for (const key of ["API_KEY","AUTH_DOMAIN","PROJECT_ID","STORAGE_BUCKET","MESSAGING_SENDER_ID","APP_ID"])
    assert.match(env, new RegExp(`NEXT_PUBLIC_FIREBASE_${key}=`));
  for (const line of env.trim().split("\n")) assert.match(line, /^[A-Z0-9_]+=$/, "example values must stay empty");
});

test("Firestore rules keep profile and listing mutations server-side", async () => {
  const rules = await readFile(new URL("../firestore.rules", import.meta.url), "utf8");
  assert.match(rules, /request\.auth\.uid == uid/);
  assert.match(rules, /match \/listings\/\{listingId\}/);
  assert.match(rules, /Alle ændringer går gennem serveren/);
  assert.match(rules, /verificationStatus == resource\.data\.verificationStatus/);
  assert.match(rules, /subscriptionPlan == resource\.data\.subscriptionPlan/);
});

test("listing API enforces owner, subscription limit, deletion and image cleanup", async () => {
  const api = await readFile(new URL("../app/api/listings/route.ts", import.meta.url), "utf8");
  const client = await readFile(new URL("../lib/firebase-listings.ts", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(api, /verifyFirebaseRequest/);
  assert.match(api, /subscriptionPlan!=="plus"/);
  assert.match(api, /const limit = 20/);
  assert.match(api, /existing\.fields\?\.ownerUid/);
  assert.match(api, /export async function DELETE/);
  assert.match(client, /deleteListingImage/);
  assert.match(client, /Promise\.allSettled/);
  assert.doesNotMatch(page, /const initialListings/);
  assert.doesNotMatch(page, /Eksempelvej|Demovej|Prøvevej|Testgade/);
});

test("Firestore chat is restricted to agreement participants and immutable messages", async () => {
  const rules = await readFile(new URL("../firestore.rules", import.meta.url), "utf8");
  assert.match(rules, /match \/messages\/\{messageId\}/);
  assert.match(rules, /request\.auth\.uid in get\(/);
  assert.match(rules, /request\.resource\.data\.senderUid == request\.auth\.uid/);
  assert.match(rules, /allow update, delete: if false/);
});

test("profiles use server-side duplicate control and agreement retention is 12 months", async () => {
  const rules = await readFile(new URL("../firestore.rules", import.meta.url), "utf8");
  const profileApi = await readFile(new URL("../app/api/profile/route.ts", import.meta.url), "utf8");
  const agreementsApi = await readFile(new URL("../app/api/agreements/route.ts", import.meta.url), "utf8");
  assert.match(rules, /match \/accountIdentityPhones\/\{fingerprint\}/);
  assert.match(rules, /allow create, update, delete: if false/);
  assert.match(profileApi, /createHmac\("sha256"/);
  assert.match(profileApi, /accountIdentityProfiles/);
  assert.match(profileApi, /firestoreDocumentName/);
  assert.doesNotMatch(profileApi, /name:firestoreDocumentUrl/);
  assert.match(agreementsApi, /retention\.setMonth\(retention\.getMonth\(\)\+12\)/);
  assert.match(agreementsApi, /verifyFirebaseRequest/);
  assert.match(agreementsApi, /ARRAY_CONTAINS/);
});

test("return receipt requires both handover signatures and both parties", async () => {
  const rules = await readFile(new URL("../firestore.rules", import.meta.url), "utf8");
  const agreementsApi = await readFile(new URL("../app/api/agreements/route.ts", import.meta.url), "utf8");
  const client = await readFile(new URL("../lib/firebase-agreements.ts", import.meta.url), "utf8");
  assert.match(rules, /Aftaler og alle fire underskrifter skrives kun via den verificerede server-API/);
  assert.match(agreementsApi, /phase === "return"/);
  assert.match(agreementsApi, /borrowerSignature \|\| !data\.lenderSignature/);
  assert.match(agreementsApi, /borrowerReturnSignature/);
  assert.match(agreementsApi, /lenderReturnSignature/);
  assert.match(agreementsApi, /fields\.returnedAt/);
  assert.match(agreementsApi, /data\.returnNote/);
  assert.match(agreementsApi, /"remarks" : "good"/);
  assert.match(client, /SignaturePhase = "handover" \| "return"/);
});

test("agreement condition notes are shared, bounded and locked by the first signature", async () => {
  const agreementsApi = await readFile(new URL("../app/api/agreements/route.ts", import.meta.url), "utf8");
  const client = await readFile(new URL("../lib/firebase-agreements.ts", import.meta.url), "utf8");
  assert.match(agreementsApi, /body\.action === "note"/);
  assert.match(agreementsApi, /note\.length > 600/);
  assert.match(agreementsApi, /signatureFields\.some/);
  assert.match(agreementsApi, /currentDocument\.updateTime/);
  assert.match(agreementsApi, /currentDocument\.exists=false/);
  assert.match(client, /saveCircleAgreementNote/);
  assert.match(client, /action:"signature"/);
  assert.match(client, /action:"note"/);
});

test("community map returns only aggregated postcode data to verified users", async () => {
  const api = await readFile(new URL("../app/api/community-map/route.ts", import.meta.url), "utf8");
  assert.match(api, /verifyFirebaseRequest/);
  assert.match(api, /fieldPath:"place"/);
  assert.match(api, /groups\.get\(key\)/);
  assert.match(api, /current\.count \+= 1/);
  assert.match(api, /private, max-age=300/);
  assert.doesNotMatch(api, /fieldPath:"street"|fieldPath:"phone"|fieldPath:"name"/);
});

test("Storage rules restrict image writes by uid, type and size", async () => {
  const rules = await readFile(new URL("../storage.rules", import.meta.url), "utf8");
  assert.match(rules, /request\.auth\.uid == uid/);
  assert.match(rules, /contentType\.matches\('image\/\.\*'\)/);
  assert.match(rules, /5 \* 1024 \* 1024/);
});

test("PWA cache contains only static/offline assets", async () => {
  const sw = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
  assert.doesNotMatch(sw, /firebase|firestore|auth|users\//i);
  assert.match(sw, /request\.mode!=="navigate"/);
});
