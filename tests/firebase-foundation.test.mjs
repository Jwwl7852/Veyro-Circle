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
