import {serviceToken} from "@/lib/firebase-server";
import {serverConfig} from "@/lib/server-config";
import {decodeFields,type Value,type Json} from "@/lib/firestore-values";
export async function queryRecords(collection:string,field:string,value:string):Promise<Array<Record<string,Json>>> {
  const response=await fetch(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(serverConfig("NEXT_PUBLIC_FIREBASE_PROJECT_ID"))}/databases/(default)/documents:runQuery`,{method:"POST",cache:"no-store",headers:{authorization:`Bearer ${await serviceToken()}`,"content-type":"application/json"},body:JSON.stringify({structuredQuery:{from:[{collectionId:collection}],where:{fieldFilter:{field:{fieldPath:field},op:"EQUAL",value:{stringValue:value}}}}})});
  if(!response.ok)throw Error("DATA_UNAVAILABLE");const rows=await response.json() as Array<{document?:{name:string;fields:Record<string,Value>}}>;
  return rows.flatMap(r=>r.document?[{...decodeFields(r.document.fields),id:r.document.name.split("/").pop()!}]:[]);
}
