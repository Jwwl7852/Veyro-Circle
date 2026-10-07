import { NextResponse } from "next/server";
import { serviceToken, verifyFirebaseRequest, type FirestoreField } from "@/lib/firebase-server";
import { serverConfig } from "@/lib/server-config";

type NumberField = FirestoreField & { integerValue?:string };
type UserDocument = { document?:{ fields?:Record<string, NumberField> } };

function error(message:string, status=400) {
  return NextResponse.json({error:message},{status,headers:{"cache-control":"private, no-store"}});
}

export async function GET(request:Request) {
  try {
    await verifyFirebaseRequest(request);
    const project = encodeURIComponent(serverConfig("NEXT_PUBLIC_FIREBASE_PROJECT_ID"));
    const response = await fetch(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents:runQuery`, {
      method:"POST",
      headers:{authorization:`Bearer ${await serviceToken()}`,"content-type":"application/json"},
      body:JSON.stringify({structuredQuery:{select:{fields:[{fieldPath:"place"}]},from:[{collectionId:"users"}]}}),
    });
    if (!response.ok) throw new Error("Brugerfordelingen kunne ikke hentes fra Firebase.");
    const rows = await response.json() as UserDocument[];
    const groups = new Map<string,{country:"DK"|"SE";postcode:string;city:string;lat:number;lon:number;count:number}>();
    for (const row of rows) {
      const place = row.document?.fields?.place?.mapValue?.fields as Record<string, NumberField> | undefined;
      const country = place?.country?.stringValue === "SE" ? "SE" : place?.country?.stringValue === "DK" ? "DK" : null;
      const postcode = place?.postcode?.stringValue?.trim() ?? "";
      const city = place?.city?.stringValue?.trim() ?? "";
      const lat = place?.lat?.doubleValue ?? Number(place?.lat?.integerValue);
      const lon = place?.lon?.doubleValue ?? Number(place?.lon?.integerValue);
      if (!country || !postcode || !city || !Number.isFinite(lat) || !Number.isFinite(lon) || lat < 54 || lat > 70 || lon < 4 || lon > 25) continue;
      const key = `${country}:${postcode}`;
      const current = groups.get(key);
      if (current) current.count += 1;
      else groups.set(key,{country,postcode,city,lat,lon,count:1});
    }
    return NextResponse.json({points:[...groups.values()]},{headers:{"cache-control":"private, max-age=300"}});
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Circle-kortet kunne ikke hentes.";
    return error(message, message.includes("logget") || message.includes("session") ? 401 : 500);
  }
}
