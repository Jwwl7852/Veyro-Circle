import { after } from "next/server";
import { notifyListingMatches } from "@/lib/search-alerts";
import type { Place } from "@/lib/marketplace";
import { cleanDetails } from "@/lib/listing-details";
import { NextResponse } from "next/server";
import { firestoreDocumentUrl, getFirestoreDocument, getServerProfile, serviceToken, verifyFirebaseRequest } from "@/lib/firebase-server";
import { serverConfig } from "@/lib/server-config";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key:string]:JsonValue };
type FirestoreValue = { nullValue?:null; booleanValue?:boolean; integerValue?:string; doubleValue?:number; stringValue?:string; timestampValue?:string; arrayValue?:{values?:FirestoreValue[]}; mapValue?:{fields?:Record<string,FirestoreValue>} };
type Photo = {src?:string;storagePath?:string;name?:string;bytes?:number;width?:number;height?:number};
type ListingPayload = {id?:string;name?:string;description?:string;category?:string;country?:string;city?:string;place?:Record<string,JsonValue>;dailyPrice?:number;deposit?:number;photos?:Photo[];details?:Record<string,string>};

const categories = new Set(["transport","tools","garden","leisure","party","kitchen","bike"]);
function error(message:string, status=400) { return NextResponse.json({error:message},{status}); }
function encode(value: JsonValue): FirestoreValue {
  if (value === null) return {nullValue:null};
  if (typeof value === "boolean") return {booleanValue:value};
  if (typeof value === "number") return Number.isInteger(value) ? {integerValue:String(value)} : {doubleValue:value};
  if (typeof value === "string") return {stringValue:value};
  if (Array.isArray(value)) return {arrayValue:{values:value.map(encode)}};
  return {mapValue:{fields:Object.fromEntries(Object.entries(value).map(([key,item])=>[key,encode(item)]))}};
}
function decode(value: FirestoreValue): JsonValue {
  if ("nullValue" in value) return null;
  if (value.booleanValue !== undefined) return value.booleanValue;
  if (value.integerValue !== undefined) return Number(value.integerValue);
  if (value.doubleValue !== undefined) return value.doubleValue;
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.timestampValue !== undefined) return value.timestampValue;
  if (value.arrayValue) return (value.arrayValue.values ?? []).map(decode);
  return Object.fromEntries(Object.entries(value.mapValue?.fields ?? {}).map(([key,item])=>[key,decode(item)]));
}

async function ownerListings(uid:string) {
  const project = encodeURIComponent(serverConfig("NEXT_PUBLIC_FIREBASE_PROJECT_ID"));
  const response = await fetch(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents:runQuery`, {
    method:"POST", headers:{authorization:`Bearer ${await serviceToken()}`,"content-type":"application/json"},
    body:JSON.stringify({structuredQuery:{from:[{collectionId:"listings"}],where:{fieldFilter:{field:{fieldPath:"ownerUid"},op:"EQUAL",value:{stringValue:uid}}}}}),
  });
  if (!response.ok) throw new Error("Dine annoncer kunne ikke kontrolleres.");
  const rows = await response.json() as Array<{document?:{name:string;fields?:Record<string,FirestoreValue>}}>;
  return rows.flatMap(row => row.document ? [{id:row.document.name.split("/").at(-1)!, data:Object.fromEntries(Object.entries(row.document.fields ?? {}).map(([key,value])=>[key,decode(value)]))}] : []);
}

export async function POST(request:Request) {
  try {
    const identity = await verifyFirebaseRequest(request);
    const profile = await getServerProfile(identity.localId);
    const body = await request.json() as {listing?:ListingPayload};
    const listing = body.listing;
    const id = listing?.id ?? "";
    const name = listing?.name?.trim() ?? "";
    const description = listing?.description?.trim() ?? "";
    const place = listing?.place ?? {};
    const country = place.country === "SE" ? "SE" : place.country === "DK" ? "DK" : "";
    const photos = Array.isArray(listing?.photos) ? listing.photos.slice(0, 2) : [];
    if (!/^[A-Za-z0-9_-]{20,80}$/.test(id) || !name || name.length > 120 || description.length > 1500 || !categories.has(listing?.category ?? "")) return error("Annonceoplysningerne er ugyldige.");
    if (!place.id || typeof place.id !== "string" || !place.city || typeof place.city !== "string" || !place.postcode || typeof place.postcode !== "string" || country !== profile.country) return error("Vælg en gyldig by i dit profilland.");
    if (!Number.isInteger(listing?.dailyPrice) || listing!.dailyPrice! < 0 || listing!.dailyPrice! > 10_000_000) return error("Dagsprisen er ugyldig.");
    const prefix = `users/${identity.localId}/listings/${id}/`;
    if (photos.some(photo => !photo.src?.startsWith("https://") || !photo.storagePath?.startsWith(prefix) || !Number.isInteger(photo.bytes) || Number(photo.bytes) > 5 * 1024 * 1024)) return error("Annoncebillederne er ugyldige.");
    if (!profile.name || !profile.street || !profile.phone || !profile.place.id) return error("Din profil skal færdiggøres, før du kan oprette en annonce.");

    const existing = await getFirestoreDocument(`listings/${id}`);
    if (existing?.fields?.ownerUid?.stringValue && existing.fields.ownerUid.stringValue !== identity.localId) return error("Du kan kun redigere dine egne annoncer.",403);
    // Older clients must not erase an owner's deposit by omitting the field.
    const deposit = listing?.deposit ?? (existing?.fields?.deposit ? decode(existing.fields.deposit) : 0);
    if (typeof deposit !== "number" || !Number.isSafeInteger(deposit) || deposit < 0 || deposit > 10_000_000) return error("Depositum skal være mellem 0 og 100.000 kr. med højst to decimaler.");
    if (!existing) {
      const current = await ownerListings(identity.localId);
      const activeCount = current.filter(item => item.data.active !== false).length;
      const limit = profile.subscriptionPlan === "plus" ? 20 : 1;
      if (activeCount >= limit) return error(profile.subscriptionPlan === "plus" ? "Du kan højst have 20 aktive annoncer." : "Gratis medlemskab giver plads til én aktiv annonce. Opgradér til Circle Plus for flere.",409);
    }
    const now = new Date().toISOString();
    const data:Record<string,JsonValue> = {
      ownerUid:identity.localId, owner:profile.name.split(/\s+/)[0],
      name, description, category:listing!.category!, country, city:String(place.city), place,
      dailyPrice:listing!.dailyPrice!, deposit, details:cleanDetails(listing!.category!,listing?.details ?? (existing?.fields?.details ? decode(existing.fields.details) : {})), photos:photos as unknown as JsonValue[], active:true,
    };
    const fields = Object.fromEntries(Object.entries(data).map(([key,value])=>[key,encode(value)]));
    fields.updatedAt = {timestampValue:now};
    fields.createdAt = existing?.fields?.createdAt ?? {timestampValue:now};
    const response = await fetch(firestoreDocumentUrl(`listings/${id}`), {method:"PATCH",headers:{authorization:`Bearer ${await serviceToken()}`,"content-type":"application/json"},body:JSON.stringify({fields})});
    if (!response.ok) throw new Error("Annoncen kunne ikke gemmes i Firebase.");
    if(!existing) after(()=>notifyListingMatches(id,identity.localId,{name,description,country,category:listing!.category!,dailyPrice:listing!.dailyPrice!,place:place as unknown as Place,city:String(place.city)}));
    return NextResponse.json({ok:true,id});
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Annoncen kunne ikke gemmes.";
    return error(message, message.includes("logget") || message.includes("session") ? 401 : 500);
  }
}

export async function GET(request:Request) {
  try {
    await verifyFirebaseRequest(request);
    const id = new URL(request.url).searchParams.get("id") ?? "";
    if (!/^[A-Za-z0-9_-]{20,80}$/.test(id)) return error("Annonce-ID'et er ugyldigt.");
    const listing = await getFirestoreDocument(`listings/${id}`);
    const ownerUid = listing?.fields?.ownerUid?.stringValue;
    if (!ownerUid || listing?.fields?.active?.booleanValue === false) return error("Annoncen findes ikke længere.",404);
    const profile = await getServerProfile(ownerUid);
    if (!profile.name || !profile.street || !profile.phone || !profile.place.id) return error("Ejerens profil er ikke komplet.",409);
    return NextResponse.json({contact:{name:profile.name,street:profile.street,phone:profile.phone,place:profile.place}});
  } catch (cause) { return error(cause instanceof Error ? cause.message : "Ejerens aftaleoplysninger kunne ikke hentes.",500); }
}

export async function DELETE(request:Request) {
  try {
    const identity = await verifyFirebaseRequest(request);
    const id = new URL(request.url).searchParams.get("id") ?? "";
    if (!/^[A-Za-z0-9_-]{20,80}$/.test(id)) return error("Annonce-ID'et er ugyldigt.");
    const existing = await getFirestoreDocument(`listings/${id}`);
    if (!existing) return NextResponse.json({ok:true});
    if (existing.fields?.ownerUid?.stringValue !== identity.localId) return error("Du kan kun slette dine egne annoncer.",403);
    const response = await fetch(firestoreDocumentUrl(`listings/${id}`), {method:"DELETE",headers:{authorization:`Bearer ${await serviceToken()}`}});
    if (!response.ok) throw new Error("Annoncen kunne ikke slettes fra Firebase.");
    return NextResponse.json({ok:true});
  } catch (cause) { return error(cause instanceof Error ? cause.message : "Annoncen kunne ikke slettes.",500); }
}
