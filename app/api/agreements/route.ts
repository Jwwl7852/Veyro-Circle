import {validTime} from "@/lib/agreement-schedule";
import { blockedPeriods, unavailablePeriods } from "@/lib/listing-calendar-server";
import { sendCirclePush } from "@/lib/push-server";
import { NextResponse, after } from "next/server";
import { commitFirestoreWrites, firestoreDocumentName, firestoreDocumentUrl, getFirestoreDocument, getServerProfile, serviceToken, verifyFirebaseRequest } from "@/lib/firebase-server";
import { serverConfig } from "@/lib/server-config";
import { agreementNotices, agreementStage, circleToday, decisionAllowed, overlaps, reservesDates, type Decision, type WorkflowAgreement } from "@/lib/agreement-workflow";
import { dayCount } from "@/lib/marketplace";
import { phasePhotos, photosSeen, type AgreementPhotos } from "@/lib/agreement-photos";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key:string]:JsonValue };
type FirestoreValue = { nullValue?:null; booleanValue?:boolean; integerValue?:string; doubleValue?:number; stringValue?:string; timestampValue?:string; arrayValue?:{values?:FirestoreValue[]}; mapValue?:{fields?:Record<string,FirestoreValue>} };

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

function error(message:string, status=400) { return NextResponse.json({error:message},{status}); }
const responseHeaders = {"Cache-Control":"private, no-store"};
const validId = (id: unknown): id is string => typeof id === "string" && /^[A-Za-z0-9_-]{10,100}$/.test(id);
function activity(uid:string, kind:string, now:string): Record<string,FirestoreValue> {
  return {activityAt:{timestampValue:now},activityBy:{stringValue:uid},activityKind:{stringValue:kind},updatedAt:{timestampValue:now}};
}
async function queryAgreements(fieldPath:string, op:string, value:string) {
  const project = encodeURIComponent(serverConfig("NEXT_PUBLIC_FIREBASE_PROJECT_ID"));
  const response = await fetch(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents:runQuery`, {
    method:"POST", cache:"no-store", headers:{authorization:`Bearer ${await serviceToken()}`,"content-type":"application/json"},
    body:JSON.stringify({structuredQuery:{from:[{collectionId:"agreements"}],where:{fieldFilter:{field:{fieldPath},op,value:{stringValue:value}}}}}),
  });
  if (!response.ok) throw new Error("Aftalerne kunne ikke hentes.");
  const rows = await response.json() as Array<{document?:{fields?:Record<string,FirestoreValue>}}>;
  return rows.flatMap(row => row.document?.fields ? [Object.fromEntries(Object.entries(row.document.fields).map(([key,value])=>[key,decode(value)]))] : []);
}
function workflow(data:Record<string,JsonValue>) { return data as unknown as WorkflowAgreement; }
// Pending requests must not disclose either party's private contact details,
// including legacy requests created before this policy.
function visibleAgreement(data:Record<string,JsonValue>) {
  if(data.contactsReleased===true || ["accepted","handedOver","returned"].includes(agreementStage(workflow(data))))return data;
  const cleanParty=(value:JsonValue)=>{const p=(value??{}) as Record<string,JsonValue>;return {name:p.name??"",place:p.place??{},street:"",phone:"",email:""};};
  return {...data,borrower:cleanParty(data.borrower),lender:cleanParty(data.lender)};
}
function updateWrite(id:string, fields:Record<string,FirestoreValue>, updateTime:string) {
  return {update:{name:firestoreDocumentName(`agreements/${id}`),fields},updateMask:{fieldPaths:Object.keys(fields)},currentDocument:{updateTime}};
}

export async function GET(request:Request) {
  try {
    const identity = await verifyFirebaseRequest(request);
    const listingId = new URL(request.url).searchParams.get("listingId");
    if (listingId !== null) {
      if (!validId(listingId)) return error("Annonce-ID er ugyldigt.");
      const bookings = await queryAgreements("item.id","EQUAL",listingId);
      const periods = bookings.filter(a=>reservesDates(workflow(a)) && String(a.to) >= circleToday()).map(a=>({from:a.from,to:a.to}));
      return NextResponse.json({periods},{headers:responseHeaders});
    }
    const now = Date.now();
    const agreements = (await queryAgreements("participantUids", "ARRAY_CONTAINS", identity.localId))
      .filter(item => typeof item.retentionUntil !== "string" || Date.parse(item.retentionUntil) >= now);
    return NextResponse.json({agreements:agreements.map(visibleAgreement)},{headers:responseHeaders});
  } catch (cause) { return error(cause instanceof Error ? cause.message : "Aftalerne kunne ikke hentes.", 401); }
}

export async function POST(request:Request) {
  try {
    const identity = await verifyFirebaseRequest(request);
    const body = await request.json() as {agreement?:Record<string,JsonValue>};
    const draft = body.agreement;
    if (!draft || !validId(draft.id) || draft.borrowerUid !== identity.localId) return error("Aftalen tilhører ikke den aktuelle bruger.",403);
    const item = draft.item as Record<string,JsonValue> | undefined;
    if (!validId(item?.id) || typeof draft.from !== "string" || typeof draft.to !== "string") return error("Vælg en annonce og gyldige datoer.");
    const hasTimes=draft.pickupTime!==undefined || draft.returnTime!==undefined;
    if(hasTimes && (!validTime(draft.pickupTime)||!validTime(draft.returnTime)||(draft.from===draft.to&&draft.returnTime<=draft.pickupTime))) return error("Vælg gyldige afhentnings- og returtider.");
    const days = dayCount(draft.from, draft.to);
    if (!days || days > 366 || draft.from < circleToday()) return error("Vælg gyldige datoer fra i dag og højst 366 dage.");
    if (typeof draft.deposit !== "number" || !Number.isSafeInteger(draft.deposit) || draft.deposit < 0 || draft.deposit > 10_000_000 || typeof draft.message !== "string" || draft.message.length > 2000) return error("Depositum eller besked er ugyldig.");
    const existing = await getFirestoreDocument(`agreements/${draft.id}`);
    if (existing) {
      const old = Object.fromEntries(Object.entries(existing.fields ?? {}).map(([key,value])=>[key,decode(value)]));
      if (old.borrowerUid === identity.localId && (old.item as Record<string,JsonValue>)?.id === item.id && old.from === draft.from && old.to === draft.to && old.deposit === draft.deposit && old.message === draft.message.trim() && old.pickupTime===draft.pickupTime && old.returnTime===draft.returnTime) return NextResponse.json({ok:true,agreement:visibleAgreement(old)},{headers:responseHeaders});
      return error("Aftalen er allerede gemt og kan ikke overskrives.",409);
    }
    const listing = await getFirestoreDocument(`listings/${item.id}`);
    const ownerUid = listing?.fields?.ownerUid?.stringValue;
    if (!ownerUid || listing?.fields?.active?.booleanValue === false) return error("Annoncen findes ikke længere.",404);
    if (ownerUid === identity.localId) return error("Du kan ikke låne din egen ting.");
    if ((await unavailablePeriods(item.id)).some(period=>overlaps(period,{from:draft.from as string,to:draft.to as string}))) return error("Tingen er allerede booket eller blokeret i perioden. Vælg andre datoer.",409);
    const [borrower, lender] = await Promise.all([getServerProfile(identity.localId),getServerProfile(ownerUid)]);
    if(lender.subscriptionPlan!=="plus")return error("Ejeren skal have Circle Plus for at modtage nye forespørgsler.",409);
    if ([borrower,lender].some(p=>!p.name || !p.phone || !p.street || !p.place.id)) return error("Begge profiler skal være udfyldt før en forespørgsel.");
    const listingData = Object.fromEntries(Object.entries(listing?.fields ?? {}).map(([key,value])=>[key,decode(value)]));
    const price = listingData.dailyPrice;
    if (typeof price !== "number" || !Number.isSafeInteger(price) || price < 0) return error("Annoncens pris er ugyldig.");
    const deposit = listingData.deposit ?? 0;
    if (typeof deposit !== "number" || !Number.isSafeInteger(deposit) || deposit < 0 || deposit > 10_000_000) return error("Annoncens depositum er ugyldigt.");
    if (draft.deposit !== deposit || item.dailyPrice !== price) return error("Annoncens pris eller depositum er ændret. Luk forespørgslen og åbn annoncen igen.",409);
    // Only server-owned identity, price and status enter the saved agreement.
    const agreement:Record<string,JsonValue> = {
      id:draft.id, borrowerUid:identity.localId, lenderUid:ownerUid, participantUids:[identity.localId,ownerUid],
      borrower:{name:borrower.name,email:"",phone:"",street:"",place:borrower.place},
      lender:{name:lender.name,phone:"",street:"",place:lender.place},
      item:{id:item.id,name:listingData.name,category:listingData.category,country:listingData.country,dailyPrice:price},
      from:draft.from,to:draft.to,...(hasTimes?{pickupTime:draft.pickupTime,returnTime:draft.returnTime}:{}),days,total:price*days,deposit,message:draft.message.trim(),
      handoverNote:"",returnNote:"",requestStatus:"requested",
    };
    const now = new Date(); const retention = new Date(now); retention.setMonth(retention.getMonth()+12);
    const fields = Object.fromEntries(Object.entries({...agreement,createdAt:now.toISOString(),updatedAt:now.toISOString(),retentionUntil:retention.toISOString()}).map(([key,value])=>[key, key.endsWith("At") || key === "retentionUntil" ? {timestampValue:String(value)} : encode(value as JsonValue)]));
    Object.assign(fields,activity(identity.localId,"requested",now.toISOString()));
    const response = await fetch(`${firestoreDocumentUrl(`agreements/${agreement.id}`)}?currentDocument.exists=false`, {method:"PATCH",headers:{authorization:`Bearer ${await serviceToken()}`,"content-type":"application/json"},body:JSON.stringify({fields})});
    if (response.status === 409 || response.status === 412) return error("Aftalen er allerede gemt og kan ikke overskrives.",409);
    if (!response.ok) throw new Error("Aftalen kunne ikke gemmes i Firebase.");
    after(()=>sendCirclePush(ownerUid,"requested",String(agreement.id)));
    return NextResponse.json({ok:true,agreement:Object.fromEntries(Object.entries(fields).map(([key,value])=>[key,decode(value)]))},{headers:responseHeaders});
  } catch (cause) { return error(cause instanceof Error ? cause.message : "Aftalen kunne ikke gemmes.",500); }
}

export async function PATCH(request:Request) {
  try {
    const identity = await verifyFirebaseRequest(request);
    const body = await request.json() as {id?:string;action?:"signature"|"note"|Decision|"read"|"message";role?:"borrower"|"lender";phase?:"handover"|"return";signature?:JsonValue;note?:string;seenNote?:string;seenTo?:string;seenPhotoIds?:string[];noticeIds?:string[];text?:string;messageId?:string};
    if (!validId(body.id) || !["handover","return"].includes(body.phase ?? "handover")) return error("Aftaleopdateringen er ugyldig.");
    const documentResponse = await fetch(firestoreDocumentUrl(`agreements/${body.id}`), {cache:"no-store",headers:{authorization:`Bearer ${await serviceToken()}`}});
    if (!documentResponse.ok) return error("Aftalen findes ikke.",404);
    const document = await documentResponse.json() as {fields?:Record<string,FirestoreValue>;updateTime?:string};
    const data = Object.fromEntries(Object.entries(document.fields ?? {}).map(([key,value])=>[key,decode(value)]));
    const participants = Array.isArray(data.participantUids) ? data.participantUids : [];
    if (!participants.includes(identity.localId)) return error("Du er ikke part i denne aftale.",403);
    if (!document.updateTime) return error("Aftalens version kunne ikke læses.",409);
    if (typeof data.retentionUntil === "string" && Date.parse(data.retentionUntil) < Date.now()) return error("Aftalens opbevaringsperiode er udløbet.",410);
    const now = new Date().toISOString();
    if (body.action === "read") {
      const valid = new Set(agreementNotices(workflow(data),identity.localId).map(n=>n.id));
      if (!Array.isArray(body.noticeIds) || body.noticeIds.length > 10 || body.noticeIds.some(id=>typeof id !== "string")) return error("Ugyldige notifikationer.");
      const reads = (data.notificationReads ?? {}) as Record<string,JsonValue>;
      const previous = Array.isArray(reads[identity.localId]) ? reads[identity.localId] as string[] : [];
      const next = [...new Set([...previous,...body.noticeIds.filter(id=>valid.has(id))])].slice(-20);
      await commitFirestoreWrites([updateWrite(body.id,{notificationReads:encode({...reads,[identity.localId]:next})},document.updateTime)]);
      return NextResponse.json({ok:true});
    }
    if (body.action === "message") {
      const text = typeof body.text === "string" ? body.text.trim() : "";
      if (!text || text.length > 2000 || !validId(body.messageId)) return error("Beskeden skal være mellem 1 og 2.000 tegn.");
      const path = `agreements/${body.id}/messages/${body.messageId}`;
      const existingMessage = await getFirestoreDocument(path);
      if (existingMessage) return existingMessage.fields?.senderUid?.stringValue === identity.localId && existingMessage.fields?.text?.stringValue === text ? NextResponse.json({ok:true}) : error("Besked-ID findes allerede.",409);
      await commitFirestoreWrites([
        {update:{name:firestoreDocumentName(path),fields:{senderUid:{stringValue:identity.localId},text:{stringValue:text},createdAt:{timestampValue:now}}},currentDocument:{exists:false}},
        updateWrite(body.id,activity(identity.localId,"message",now),document.updateTime),
      ]);
      const recipient=participants.find(uid=>typeof uid === "string" && uid !== identity.localId);
      if (typeof recipient === "string") { const ticket=body.id; after(()=>sendCirclePush(recipient,"message",ticket)); }
      return NextResponse.json({ok:true});
    }
    if (body.action && ["accept","decline","cancel"].includes(body.action)) {
      const action = body.action as Decision;
      if (!decisionAllowed(workflow(data),identity.localId,action)) return error("Du kan ikke udføre denne handling på aftalen.",403);
      const status = action === "accept" ? "accepted" : action === "decline" ? "declined" : "cancelled";
      const fields:Record<string,FirestoreValue> = {...activity(identity.localId,status,now),requestStatus:{stringValue:status}};
      const writes:unknown[] = [updateWrite(body.id,fields,document.updateTime)];
      if (action === "accept") {
        if (typeof data.to !== "string" || data.to < circleToday()) return error("Perioden er udløbet. Bed om en ny forespørgsel.",409);
        const itemId = (data.item as Record<string,JsonValue>)?.id;
        if (!validId(itemId)) return error("Annoncen mangler et gyldigt ID.");
        const listing = await getFirestoreDocument(`listings/${itemId}`);
        if (!listing || listing.fields?.active?.booleanValue === false || listing.fields?.ownerUid?.stringValue !== identity.localId) return error("Annoncen er ikke længere aktiv hos dig.",409);
        // Read the per-item version BEFORE the overlap query. Concurrent approvals
        // cannot both commit even when their queries initially see no reservation.
        const lock = await getFirestoreDocument(`bookingLocks/${itemId}`);
        if ((await blockedPeriods(itemId)).some(period=>overlaps(period,workflow(data)))) return error("Tingen er blokeret af ejeren i denne periode.",409);
        const bookings = await queryAgreements("item.id","EQUAL",itemId);
        if (bookings.some(other=>other.id !== body.id && reservesDates(workflow(other)) && overlaps(workflow(data),workflow(other)))) return error("Tingen er allerede booket i en del af perioden. Vælg andre datoer.",409);
        const [borrower,lender]=await Promise.all([getServerProfile(String(data.borrowerUid)),getServerProfile(String(data.lenderUid))]);
        if(lender.subscriptionPlan!=="plus")return error("Circle Plus kræves for at godkende nye udlån.",409);
        if([borrower,lender].some(p=>!p.name||!p.street||!p.phone||!p.place.id))return error("Begge profiler skal være komplette før godkendelse.",409);
        fields.borrower=encode({name:borrower.name,email:borrower.email,phone:borrower.phone,street:borrower.street,place:borrower.place});
        fields.lender=encode({name:lender.name,phone:lender.phone,street:lender.street,place:lender.place});
        fields.contactsReleased={booleanValue:true};
        writes[0]=updateWrite(body.id,fields,document.updateTime);
        writes.push({verify:firestoreDocumentName(`listings/${itemId}`),currentDocument:{updateTime:listing.updateTime}});
        writes.push({update:{name:firestoreDocumentName(`bookingLocks/${itemId}`),fields:{updatedAt:{timestampValue:now}}},currentDocument:lock ? {updateTime:lock.updateTime} : {exists:false}});
      }
      await commitFirestoreWrites(writes);
      return NextResponse.json({ok:true,requestStatus:status});
    }
    if (!["accepted","handedOver"].includes(agreementStage(workflow(data)))) return error("Ejeren skal godkende forespørgslen, før aftalen kan underskrives eller ændres.",409);
    const phase = body.phase ?? "handover";
    if (body.action === "note") {
      const note = typeof body.note === "string" ? body.note.trim() : "";
      if (note.length > 600) return error("Noten må højst indeholde 600 tegn.");
      if (phase === "return" && (!data.borrowerSignature || !data.lenderSignature)) return error("Udleveringen skal være underskrevet af begge parter først.",409);
      const signatureFields = phase === "return" ? ["borrowerReturnSignature","lenderReturnSignature"] : ["borrowerSignature","lenderSignature"];
      if (signatureFields.some(field=>Boolean(data[field]))) return error("Noten er låst, fordi en part allerede har underskrevet.",409);
      const field = phase === "return" ? "returnNote" : "handoverNote";
      const now = new Date().toISOString();
      const fields:Record<string,FirestoreValue> = {[field]:{stringValue:note},...activity(identity.localId,"note",now)};
      const masks = [...Object.keys(fields).map(key=>`updateMask.fieldPaths=${encodeURIComponent(key)}`), ...(document.updateTime ? [`currentDocument.updateTime=${encodeURIComponent(document.updateTime)}`] : [])].join("&");
      const response = await fetch(`${firestoreDocumentUrl(`agreements/${body.id}`)}?${masks}`,{method:"PATCH",headers:{authorization:`Bearer ${await serviceToken()}`,"content-type":"application/json"},body:JSON.stringify({fields})});
      if (response.status === 409 || response.status === 412) return error("Aftalen blev ændret samtidig. Åbn den igen og prøv på ny.",409);
      if (!response.ok) throw new Error("Noten kunne ikke gemmes.");
      return NextResponse.json({ok:true,note});
    }
    if ((body.seenTo!==undefined || Array.isArray(data.extensions)&&data.extensions.length>0) && body.seenTo!==data.to) return error("Aftalen er forlænget. Åbn den igen og læs de nye vilkår før underskrift.",409);
    if (!body.signature || !["borrower","lender"].includes(body.role ?? "")) return error("Underskriften er ugyldig.");
    if (!data.borrowerUid || !data.lenderUid || data.borrowerUid === data.lenderUid) return error("Aftalen skal være knyttet til to forskellige konti. Opret en ny forespørgsel på den rigtige annonce.",409);
    const currentNote = String(data[phase === "return" ? "returnNote" : "handoverNote"] ?? "");
    if (body.seenNote !== currentNote) return error("Noten er ændret. Åbn aftalen igen, læs noten og underskriv på ny.",409);
    const photos = phasePhotos(data as unknown as AgreementPhotos, phase);
    if (!photosSeen(photos, body.seenPhotoIds)) return error("Billederne er ændret. Åbn aftalen igen, gennemgå billederne og underskriv på ny.",409);
    const signature = body.signature as Record<string,JsonValue>;
    if (typeof signature.dataUrl !== "string" || !signature.dataUrl.startsWith("data:image/png;base64,") || signature.dataUrl.length > 400_000 || typeof signature.signedAt !== "string" || !Number.isFinite(Date.parse(signature.signedAt))) return error("Underskriftsdata er ugyldige.");
    const expected = body.role === "borrower" ? data.borrowerUid : data.lenderUid;
    if (expected !== identity.localId) return error("Du kan kun underskrive som dig selv.",403);
    if (phase === "return" && (!data.borrowerSignature || !data.lenderSignature)) return error("Begge parter skal underskrive udleveringen, før returkvitteringen kan underskrives.",409);
    if (data.returnedAt) return error("Returkvitteringen er allerede afsluttet.",409);
    const field = phase === "return" ? `${body.role}ReturnSignature` : `${body.role}Signature`;
    if (data[field]) return error("Denne underskrift er allerede registreret.",409);
    const fields:Record<string,FirestoreValue> = {[field]:encode({dataUrl:signature.dataUrl,signedAt:now,photoIds:photos.map(p=>p.id)}),...activity(identity.localId,"signature",now)};
    const otherReturnField = body.role === "borrower" ? "lenderReturnSignature" : "borrowerReturnSignature";
    const completedReturn = phase === "return" && Boolean(data[otherReturnField]);
    if (completedReturn) {
      fields.returnedAt = {timestampValue:now};
      fields.activityKind = {stringValue:"returned"};
      fields.returnCondition = {stringValue:typeof data.returnNote === "string" && data.returnNote.trim() ? "remarks" : "good"};
    }
    const masks = [...Object.keys(fields).map(key=>`updateMask.fieldPaths=${encodeURIComponent(key)}`), ...(document.updateTime ? [`currentDocument.updateTime=${encodeURIComponent(document.updateTime)}`] : [])].join("&");
    const url = `${firestoreDocumentUrl(`agreements/${body.id}`)}?${masks}`;
    const response = await fetch(url,{method:"PATCH",headers:{authorization:`Bearer ${await serviceToken()}`,"content-type":"application/json"},body:JSON.stringify({fields})});
    if (response.status === 409 || response.status === 412) return error("Aftalen blev ændret samtidig. Åbn den igen og prøv på ny.",409);
    if (!response.ok) throw new Error("Underskriften kunne ikke gemmes.");
    return NextResponse.json({ok:true,...(completedReturn ? {returnedAt:now,returnCondition:typeof data.returnNote === "string" && data.returnNote.trim() ? "remarks" : "good"} : {})});
  } catch (cause) {
    if (cause instanceof Error && cause.message === "IDENTITY_CONFLICT") return error("Aftalen blev ændret samtidig. Opdatér og prøv igen.",409);
    return error(cause instanceof Error ? cause.message : "Aftalen kunne ikke opdateres.",500);
  }
}
