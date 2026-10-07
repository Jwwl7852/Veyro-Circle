import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { commitFirestoreWrites, firestoreDocumentName, getFirestoreDocument, verifyFirebaseRequest, type FirestoreField } from "@/lib/firebase-server";
import { serverConfig } from "@/lib/server-config";

type Payload = {
  name?:string; email?:string; phone?:string; street?:string;
  place?:{id?:string; country?:string; postcode?:string; city?:string; lat?:number; lon?:number};
  taxAcknowledgement?:{version?:string; country?:string; acceptedAt?:string}; preferredLanguage?:string;
};

const text = (value: string): FirestoreField => ({stringValue:value});
const timestamp = (value: string): FirestoreField => ({timestampValue:value});
const map = (fields: Record<string, FirestoreField>): FirestoreField => ({mapValue:{fields}});
const normal = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("da-DK").replace(/[^a-z0-9]+/g, " ").trim();

function canonicalPhone(phone: string, country: string) {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (country === "DK" && digits.length === 8) digits = `45${digits}`;
  if (country === "SE" && digits.startsWith("0")) digits = `46${digits.slice(1)}`;
  return digits;
}

function fingerprint(value: string) {
  // Servicekontoens private nøgle findes kun på serveren og fungerer også som
  // hemmelig HMAC-nøgle, så personoplysninger aldrig bruges som dokument-id i klartekst.
  return createHmac("sha256", serverConfig("FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY")).update(value).digest("hex");
}

function error(message: string, status = 400) { return NextResponse.json({error:message}, {status}); }

export async function POST(request: Request) {
  try {
    const identity = await verifyFirebaseRequest(request);
    const body = await request.json() as Payload;
    const name = body.name?.trim() ?? ""; const email = body.email?.trim().toLowerCase() ?? "";
    const phone = body.phone?.trim() ?? ""; const street = body.street?.trim() ?? ""; const place = body.place;
    const language = body.preferredLanguage === "sv" ? "sv" : "da";
    if (!name || name.length > 100 || !street || street.length > 200 || !place?.id || !place.city || !place.postcode || !["DK","SE"].includes(place.country ?? "")) return error("Navn, adresse, postnummer og by skal udfyldes korrekt.");
    if (email !== identity.email.toLowerCase()) return error("E-mailadressen skal være den samme som dit login.");
    const phoneCanonical = canonicalPhone(phone, place.country!);
    if (!/^45\d{8}$/.test(phoneCanonical) && !/^46\d{7,10}$/.test(phoneCanonical)) return error("Indtast et gyldigt dansk eller svensk telefonnummer.");

    const phoneKey = fingerprint(`phone:${phoneCanonical}`);
    const compositeKey = fingerprint(["profile", normal(name), normal(street), place.postcode, normal(place.city), place.country, phoneCanonical].join("|"));
    const phonePath = `accountIdentityPhones/${phoneKey}`; const compositePath = `accountIdentityProfiles/${compositeKey}`;
    const [phoneDoc, compositeDoc, existing] = await Promise.all([getFirestoreDocument(phonePath), getFirestoreDocument(compositePath), getFirestoreDocument(`users/${identity.localId}`)]);
    for (const document of [phoneDoc, compositeDoc]) if (document?.fields?.uid?.stringValue !== undefined && document.fields.uid.stringValue !== identity.localId) return error("Oplysningerne er allerede knyttet til en anden Circle-konto. Hver abonnent må kun have én konto.", 409);

    const oldPhoneKey = existing?.fields?.identityPhoneKey?.stringValue;
    const oldCompositeKey = existing?.fields?.identityCompositeKey?.stringValue;
    const [oldPhoneDoc, oldCompositeDoc] = await Promise.all([
      oldPhoneKey && oldPhoneKey !== phoneKey ? getFirestoreDocument(`accountIdentityPhones/${oldPhoneKey}`) : null,
      oldCompositeKey && oldCompositeKey !== compositeKey ? getFirestoreDocument(`accountIdentityProfiles/${oldCompositeKey}`) : null,
    ]);
    const now = new Date().toISOString();
    const writes: unknown[] = [];
    const reserve = (path:string, current:typeof phoneDoc) => {
      if (current) return;
      writes.push({update:{name:firestoreDocumentName(path),fields:{uid:text(identity.localId),createdAt:timestamp(now)}},currentDocument:{exists:false}});
    };
    reserve(phonePath, phoneDoc); reserve(compositePath, compositeDoc);
    const userFields:Record<string,FirestoreField> = {
      uid:text(identity.localId), name:text(name), email:text(email), phone:text(phone), street:text(street),
      place:map({id:text(place.id),country:text(place.country!),postcode:text(place.postcode),city:text(place.city),lat:{doubleValue:Number(place.lat ?? 0)},lon:{doubleValue:Number(place.lon ?? 0)}}),
      preferredLanguage:text(language), verificationStatus:text("verified"), identityPhoneKey:text(phoneKey), identityCompositeKey:text(compositeKey), updatedAt:timestamp(now),
    };
    if (body.taxAcknowledgement?.version && body.taxAcknowledgement.acceptedAt) userFields.taxAcknowledgement = map({version:text(body.taxAcknowledgement.version),country:text(body.taxAcknowledgement.country ?? place.country!),acceptedAt:text(body.taxAcknowledgement.acceptedAt)});
    if (!existing) { userFields.createdAt = timestamp(now); userFields.subscriptionPlan = text("free"); }
    writes.push({update:{name:firestoreDocumentName(`users/${identity.localId}`),fields:userFields},updateMask:{fieldPaths:Object.keys(userFields)}});
    if (oldPhoneKey && oldPhoneKey !== phoneKey && oldPhoneDoc?.fields?.uid?.stringValue === identity.localId) writes.push({delete:firestoreDocumentName(`accountIdentityPhones/${oldPhoneKey}`)});
    if (oldCompositeKey && oldCompositeKey !== compositeKey && oldCompositeDoc?.fields?.uid?.stringValue === identity.localId) writes.push({delete:firestoreDocumentName(`accountIdentityProfiles/${oldCompositeKey}`)});
    await commitFirestoreWrites(writes);
    return NextResponse.json({ok:true});
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Profilen kunne ikke gemmes.";
    if (message === "IDENTITY_CONFLICT") return error("Oplysningerne blev netop knyttet til en anden Circle-konto. Hver abonnent må kun have én konto.", 409);
    return error(message, message.includes("logget") || message.includes("session") ? 401 : 500);
  }
}

// Language selection updates only this preference, never contact, identity or billing fields.
export async function PATCH(request:Request) {
  let identity;try{identity=await verifyFirebaseRequest(request);}catch{return error("AUTH_REQUIRED",401);}
  try {
    const {preferredLanguage}=await request.json();
    if(!["da","sv"].includes(preferredLanguage))return error("INVALID_LANGUAGE");
    const path=`users/${identity.localId}`;
    if(!await getFirestoreDocument(path))return error("PROFILE_REQUIRED",404);
    await commitFirestoreWrites([{update:{name:firestoreDocumentName(path),fields:{preferredLanguage:text(preferredLanguage),updatedAt:timestamp(new Date().toISOString())}},updateMask:{fieldPaths:["preferredLanguage","updatedAt"]},currentDocument:{exists:true}}]);
    return NextResponse.json({ok:true},{headers:{"cache-control":"private, no-store"}});
  }catch{return error("LANGUAGE_SAVE_FAILED",409);}
}
