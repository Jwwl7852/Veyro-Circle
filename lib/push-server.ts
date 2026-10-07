import { createHash } from "node:crypto";
import { commitFirestoreWrites, firestoreDocumentName, getFirestoreDocument, serviceToken } from "@/lib/firebase-server";
import { serverConfig } from "@/lib/server-config";

export const pushId = (token:string) => createHash("sha256").update(token).digest("hex");
export function validPushToken(token:unknown):token is string { return typeof token === "string" && token.length >= 20 && token.length <= 4096 && /^[A-Za-z0-9_:\-]+$/.test(token); }
export function pushPayload(kind:"requested"|"message"|"search",id:string,lang:string) {
  return { title:"Veyro Circle", body:kind === "search" ? (lang === "sv" ? "En ny annons matchar din sparade sökning." : "En ny annonce matcher din gemte søgning.") : lang === "sv" ? (kind === "message" ? "Du har fått ett nytt meddelande i Circle." : "Du har fått en ny låneförfrågan i Circle.") : (kind === "message" ? "Du har fået en ny besked i Circle." : "Du har fået en ny låneforespørgsel i Circle."), url:kind === "search" ? `/?listing=${encodeURIComponent(id)}&push=search` : `/?ticket=${encodeURIComponent(id)}&push=${kind}`, tag:`circle-${id}-${kind}` };
}

// Only called after a successful server-authorised write; no client-selected recipients.
// Push is best effort: an unavailable push service must never undo a saved message.
export async function sendCirclePush(uid:string,kind:"requested"|"message"|"search",id:string) {
  if (process.env.CIRCLE_PUSH_ENABLED !== "true") return;
  try {
    const project=serverConfig("NEXT_PUBLIC_FIREBASE_PROJECT_ID");
    const query=await fetch(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(project)}/databases/(default)/documents:runQuery`,{method:"POST",headers:{authorization:`Bearer ${await serviceToken()}`,"content-type":"application/json"},body:JSON.stringify({structuredQuery:{from:[{collectionId:"pushDevices"}],where:{fieldFilter:{field:{fieldPath:"uid"},op:"EQUAL",value:{stringValue:uid}}},limit:20}}),signal:AbortSignal.timeout(8000)});
    if (!query.ok) throw new Error("PUSH_QUERY");
    const rows=await query.json() as Array<{document?:{name:string;updateTime:string;fields:Record<string,{stringValue?:string;timestampValue?:string}>}}>;
    const access=await serviceToken("messaging");
    await Promise.all(rows.map(async ({document:d})=>{
      if (!d || !d.fields.token?.stringValue || !(Date.parse(d.fields.expiresAt?.timestampValue ?? "") > Date.now())) return;
      // Read ownership again before sending, in case this browser switched accounts.
      const current=await getFirestoreDocument(`pushDevices/${pushId(d.fields.token.stringValue)}`);
      if (current?.fields?.uid?.stringValue !== uid || current.updateTime !== d.updateTime) return;
      const response=await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(project)}/messages:send`,{method:"POST",headers:{authorization:`Bearer ${access}`,"content-type":"application/json"},body:JSON.stringify({message:{token:d.fields.token.stringValue,data:pushPayload(kind,id,d.fields.lang?.stringValue ?? "da"),webpush:{headers:{TTL:"3600",Urgency:"high"}}}}),signal:AbortSignal.timeout(8000)});
      if (!response.ok) {
        const result=await response.json();
        if (result.error?.details?.some((v:{errorCode?:string})=>v.errorCode === "UNREGISTERED")) await commitFirestoreWrites([{delete:firestoreDocumentName(`pushDevices/${pushId(d.fields.token.stringValue)}`),currentDocument:{updateTime:d.updateTime}}]);
        else console.warn("Circle push delivery failed",response.status);
      }
    }));
  } catch { console.warn("Circle push unavailable; saved activity remains in Circle"); }
}
