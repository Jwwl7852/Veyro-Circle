import {serviceToken} from "@/lib/firebase-server";
import {serverConfig} from "@/lib/server-config";
import {decodeFields,type Value} from "@/lib/firestore-values";
import {matchesSearch,type SavedSearch} from "@/lib/discovery";
import {sendCirclePush} from "@/lib/push-server";
import type {Place} from "@/lib/marketplace";
export async function notifyListingMatches(id:string,ownerUid:string,item:{name:string;description:string;country:string;category:string;dailyPrice:number;place:Place;city:string}) {
  if(process.env.CIRCLE_PUSH_ENABLED!=="true")return;
  try {
    let pageToken="";
    do {
      const project=encodeURIComponent(serverConfig("NEXT_PUBLIC_FIREBASE_PROJECT_ID"));
      const response=await fetch(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/circlePreferences?pageSize=100${pageToken?`&pageToken=${encodeURIComponent(pageToken)}`:""}`,{headers:{authorization:`Bearer ${await serviceToken()}`},signal:AbortSignal.timeout(8000)});
      if(!response.ok)throw Error();const data=await response.json() as {documents?:Array<{name:string;fields:Record<string,Value>}>;nextPageToken?:string};
      for(const doc of data.documents??[]){const uid=doc.name.split("/").pop()!;if(uid===ownerUid)continue;const searches=decodeFields(doc.fields).searches as unknown as SavedSearch[];if(Array.isArray(searches)&&searches.some(s=>s.alerts&&matchesSearch(s,item)))await sendCirclePush(uid,"search",id);}
      pageToken=data.nextPageToken??"";
    }while(pageToken);
  }catch{console.warn("Circle saved-search push unavailable");}
}
