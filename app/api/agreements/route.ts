import { NextResponse } from "next/server";
import { firestoreDocumentUrl, serviceToken, verifyFirebaseRequest } from "@/lib/firebase-server";
import { serverConfig } from "@/lib/server-config";

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

export async function GET(request:Request) {
  try {
    const identity = await verifyFirebaseRequest(request);
    const project = encodeURIComponent(serverConfig("NEXT_PUBLIC_FIREBASE_PROJECT_ID"));
    const response = await fetch(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents:runQuery`, {
      method:"POST", headers:{authorization:`Bearer ${await serviceToken()}`,"content-type":"application/json"},
      body:JSON.stringify({structuredQuery:{from:[{collectionId:"agreements"}],where:{fieldFilter:{field:{fieldPath:"participantUids"},op:"ARRAY_CONTAINS",value:{stringValue:identity.localId}}}}}),
    });
    if (!response.ok) throw new Error("Aftalerne kunne ikke hentes.");
    const rows = await response.json() as Array<{document?:{fields?:Record<string,FirestoreValue>}}>;
    const now = Date.now();
    const agreements = rows.flatMap(row => row.document?.fields ? [Object.fromEntries(Object.entries(row.document.fields).map(([key,value])=>[key,decode(value)]))] : [])
      .filter(item => typeof item.retentionUntil !== "string" || Date.parse(item.retentionUntil) >= now);
    return NextResponse.json({agreements});
  } catch (cause) { return error(cause instanceof Error ? cause.message : "Aftalerne kunne ikke hentes.", 401); }
}

export async function POST(request:Request) {
  try {
    const identity = await verifyFirebaseRequest(request);
    const body = await request.json() as {agreement?:Record<string,JsonValue>};
    const agreement = body.agreement;
    if (!agreement || typeof agreement.id !== "string" || agreement.borrowerUid !== identity.localId) return error("Aftalen tilhører ikke den aktuelle bruger.",403);
    const participants = Array.isArray(agreement.participantUids) ? agreement.participantUids : [];
    if (!participants.includes(identity.localId) || participants.length < 1 || participants.length > 2) return error("Aftalens deltagere er ugyldige.");
    delete agreement.borrowerSignature; delete agreement.lenderSignature;
    const now = new Date(); const retention = new Date(now); retention.setMonth(retention.getMonth()+12);
    const fields = Object.fromEntries(Object.entries({...agreement,createdAt:now.toISOString(),updatedAt:now.toISOString(),retentionUntil:retention.toISOString()}).map(([key,value])=>[key, key.endsWith("At") || key === "retentionUntil" ? {timestampValue:String(value)} : encode(value as JsonValue)]));
    const response = await fetch(firestoreDocumentUrl(`agreements/${agreement.id}`), {method:"PATCH",headers:{authorization:`Bearer ${await serviceToken()}`,"content-type":"application/json"},body:JSON.stringify({fields})});
    if (!response.ok) throw new Error("Aftalen kunne ikke gemmes i Firebase.");
    return NextResponse.json({ok:true});
  } catch (cause) { return error(cause instanceof Error ? cause.message : "Aftalen kunne ikke gemmes.",500); }
}

export async function PATCH(request:Request) {
  try {
    const identity = await verifyFirebaseRequest(request);
    const body = await request.json() as {id?:string;role?:"borrower"|"lender";signature?:JsonValue};
    if (!body.id || !body.signature || !["borrower","lender"].includes(body.role ?? "")) return error("Underskriften er ugyldig.");
    const documentResponse = await fetch(firestoreDocumentUrl(`agreements/${body.id}`), {headers:{authorization:`Bearer ${await serviceToken()}`}});
    if (!documentResponse.ok) return error("Aftalen findes ikke.",404);
    const document = await documentResponse.json() as {fields?:Record<string,FirestoreValue>};
    const data = Object.fromEntries(Object.entries(document.fields ?? {}).map(([key,value])=>[key,decode(value)]));
    const expected = body.role === "borrower" ? data.borrowerUid : data.lenderUid;
    if (expected !== identity.localId) return error("Du kan kun underskrive som dig selv.",403);
    const field = `${body.role}Signature`;
    const url = `${firestoreDocumentUrl(`agreements/${body.id}`)}?updateMask.fieldPaths=${field}&updateMask.fieldPaths=updatedAt`;
    const response = await fetch(url,{method:"PATCH",headers:{authorization:`Bearer ${await serviceToken()}`,"content-type":"application/json"},body:JSON.stringify({fields:{[field]:encode(body.signature),updatedAt:{timestampValue:new Date().toISOString()}}})});
    if (!response.ok) throw new Error("Underskriften kunne ikke gemmes.");
    return NextResponse.json({ok:true});
  } catch (cause) { return error(cause instanceof Error ? cause.message : "Underskriften kunne ikke gemmes.",500); }
}
