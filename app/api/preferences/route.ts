import {getFirestoreDocument,verifyFirebaseRequest,commitFirestoreWrites,firestoreDocumentName} from "@/lib/firebase-server";
import {decodeFields,encodeFields,type Json} from "@/lib/firestore-values";
import {cleanSearch,type Preferences} from "@/lib/discovery";
import {validListingId} from "@/lib/listing-calendar";
const headers={"cache-control":"private, no-store"};
async function run(request:Request,write=false) {
  let uid;try{uid=(await verifyFirebaseRequest(request)).localId;}catch{return Response.json({error:"AUTH_REQUIRED"},{status:401});}
  try {
    const path=`circlePreferences/${uid}`,doc=await getFirestoreDocument(path),data=decodeFields(doc?.fields);
    const prefs:Preferences={favorites:Array.isArray(data.favorites)?data.favorites as string[]:[],searches:Array.isArray(data.searches)?data.searches as unknown as Preferences["searches"]:[]};
    if(write){
      const body=await request.json();
      if(body.action==="favorite"&&validListingId(body.id)&&typeof body.enabled==="boolean") {
        if(body.enabled){const listing=await getFirestoreDocument(`listings/${body.id}`);if(listing?.fields?.active?.booleanValue!==true)throw Error("LISTING_MISSING");}
        prefs.favorites=prefs.favorites.filter(id=>id!==body.id);if(body.enabled)prefs.favorites.push(body.id);if(prefs.favorites.length>100)throw Error("LIMIT");
      }else if(body.action==="saveSearch"){
        const filter=cleanSearch(body.filter);if(!filter||prefs.searches.length>=20)throw Error("INVALID_SEARCH");
        prefs.searches.push({...filter,id:crypto.randomUUID(),alerts:body.alerts===true,createdAt:new Date().toISOString(),seenThrough:new Date().toISOString()});
      }else if(body.action==="removeSearch")prefs.searches=prefs.searches.filter(s=>s.id!==body.id);
      else if(body.action==="seenSearch")prefs.searches=prefs.searches.map(s=>s.id===body.id?{...s,seenThrough:new Date().toISOString()}:s);
      else throw Error("INVALID_ACTION");
      await commitFirestoreWrites([{update:{name:firestoreDocumentName(path),fields:encodeFields(prefs as unknown as Record<string,Json>)},currentDocument:doc?{updateTime:doc.updateTime}:{exists:false}}]);
    }
    return Response.json(prefs,{headers});
  }catch{return Response.json({error:"PREFERENCES_FAILED"},{status:409,headers});}
}
export const GET=(r:Request)=>run(r);export const POST=(r:Request)=>run(r,true);
