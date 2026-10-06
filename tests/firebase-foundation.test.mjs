import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Firebase example lists every required public web variable", async () => {
  const env = await readFile(new URL("../.env.example", import.meta.url), "utf8");
  for (const key of ["API_KEY","AUTH_DOMAIN","PROJECT_ID","STORAGE_BUCKET","MESSAGING_SENDER_ID","APP_ID"])
    assert.match(env, new RegExp(`NEXT_PUBLIC_FIREBASE_${key}=`));
  for (const line of env.trim().split("\n")) assert.match(line, /^[A-Z0-9_]+=$/, "example values must stay empty");
});

test("Firestore rules bind profiles and listing ownership to auth uid", async () => {
  const rules = await readFile(new URL("../firestore.rules", import.meta.url), "utf8");
  assert.match(rules, /request\.auth\.uid == uid/);
  assert.match(rules, /request\.resource\.data\.ownerUid == request\.auth\.uid/);
  assert.match(rules, /verificationStatus == resource\.data\.verificationStatus/);
  assert.match(rules, /subscriptionPlan == resource\.data\.subscriptionPlan/);
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
