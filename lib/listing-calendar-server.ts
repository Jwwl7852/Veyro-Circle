import { getFirestoreDocument, serviceToken } from "@/lib/firebase-server";
import { serverConfig } from "@/lib/server-config";
import { circleToday, reservesDates, type WorkflowAgreement } from "@/lib/agreement-workflow";
import { readBlocks, type Period } from "@/lib/listing-calendar";

export async function blockedPeriods(id:string) {return readBlocks((await getFirestoreDocument(`listingCalendars/${id}`))?.fields);}
export async function bookedPeriods(id:string):Promise<Period[]> {
  const project=encodeURIComponent(serverConfig("NEXT_PUBLIC_FIREBASE_PROJECT_ID"));
  const response=await fetch(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents:runQuery`,{method:"POST",cache:"no-store",headers:{authorization:`Bearer ${await serviceToken()}`,"content-type":"application/json"},body:JSON.stringify({structuredQuery:{from:[{collectionId:"agreements"}],where:{fieldFilter:{field:{fieldPath:"item.id"},op:"EQUAL",value:{stringValue:id}}}}})});
  if(!response.ok) throw Error("CALENDAR_UNAVAILABLE");
  const rows=await response.json() as Array<{document?:{fields?:Record<string,{stringValue?:string;mapValue?:unknown}>}}>;
  return rows.flatMap(row=>{
    const f=row.document?.fields;if(!f)return [];
    const a={from:f.from?.stringValue,to:f.to?.stringValue,requestStatus:f.requestStatus?.stringValue,borrowerSignature:f.borrowerSignature?.mapValue,lenderSignature:f.lenderSignature?.mapValue,borrowerReturnSignature:f.borrowerReturnSignature?.mapValue,lenderReturnSignature:f.lenderReturnSignature?.mapValue,returnedAt:f.returnedAt?.stringValue??(f.returnedAt as {timestampValue?:string})?.timestampValue} as WorkflowAgreement;
    return a.from && a.to && a.to>=circleToday() && reservesDates(a) ? [{from:a.from,to:a.to}] : [];
  });
}
export async function unavailablePeriods(id:string) { const [booked,blocked]=await Promise.all([bookedPeriods(id),blockedPeriods(id)]);return [...booked,...blocked.filter(b=>b.to>=circleToday()).map(({from,to})=>({from,to}))]; }
