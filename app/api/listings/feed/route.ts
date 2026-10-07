import {verifyFirebaseRequest,getFirestoreDocument,serviceToken} from "@/lib/firebase-server";
import {serverConfig} from "@/lib/server-config";
import {decodeFields,type Value} from "@/lib/firestore-values";
const headers={"cache-control":"private, no-store"};
export async function GET(request:Request) {
  let uid="";
  if(request.headers.has("authorization")){try{uid=(await verifyFirebaseRequest(request)).localId;}catch{return Response.json({error:"AUTH_REQUIRED"},{status:401,headers});}}
  try {
    const project=encodeURIComponent(serverConfig("NEXT_PUBLIC_FIREBASE_PROJECT_ID"));
    const response=await fetch(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents:runQuery`,{method:"POST",cache:"no-store",headers:{authorization:`Bearer ${await serviceToken()}`,"content-type":"application/json"},body:JSON.stringify({structuredQuery:{from:[{collectionId:"listings"}],where:{fieldFilter:{field:{fieldPath:"active"},op:"EQUAL",value:{booleanValue:true}}}}})});
    if(!response.ok)throw Error();
    const rows=await response.json() as Array<{document?:{name:string;fields:Record<string,Value>}}>;
    const listings=rows.flatMap(r=>r.document?[{id:r.document.name.split("/").pop()!,data:decodeFields(r.document.fields)}]:[]);
    const owners=[...new Set(listings.map(l=>String(l.data.ownerUid)))];
    const paid=new Set((await Promise.all(owners.map(async owner=>{const doc=await getFirestoreDocument(`users/${owner}`);return doc?.fields?.subscriptionPlan?.stringValue==="plus"?owner:null;}))).filter(Boolean));
    const fields=["ownerUid","owner","name","description","category","country","city","place","dailyPrice","deposit","photos","active","details","createdAt"];
    return Response.json({listings:listings.filter(l=>paid.has(String(l.data.ownerUid))||l.data.ownerUid===uid).map(l=>({id:l.id,...Object.fromEntries(fields.filter(k=>l.data[k]!==undefined).map(k=>[k,l.data[k]])),publishable:paid.has(String(l.data.ownerUid))}))},{headers});
  }catch{return Response.json({error:"LISTINGS_UNAVAILABLE"},{status:503,headers});}
}
