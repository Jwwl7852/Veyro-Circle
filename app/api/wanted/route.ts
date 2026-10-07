import {verifyFirebaseRequest,getFirestoreDocument,getServerProfile,commitFirestoreWrites,firestoreDocumentName} from "@/lib/firebase-server";
import {queryRecords} from "@/lib/community-server";
import {decodeFields,encodeFields,type Json} from "@/lib/firestore-values";
import {validListingId,validPeriod} from "@/lib/listing-calendar";
import {circleToday} from "@/lib/agreement-workflow";
const headers={"cache-control":"no-store"};
export async function GET(request:Request) {
  try {
    let uid="";if(request.headers.has("authorization")){try{uid=(await verifyFirebaseRequest(request)).localId;}catch{return Response.json({error:"AUTH_REQUIRED"},{status:401});}}
    const rows=(await Promise.all([queryRecords("wanted","country","DK"),queryRecords("wanted","country","SE")])).flat().filter(r=>r.status==="open"&&Date.parse(String(r.expiresAt))>Date.now()).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,100);
    return Response.json({items:rows.map(r=>({id:r.id,title:r.title,description:r.description,place:r.place,country:r.country,from:r.from,to:r.to,author:r.author,createdAt:r.createdAt,owned:r.ownerUid===uid,offers:r.ownerUid===uid?r.offers??[]:[]}))},{headers});
  }catch{return Response.json({error:"WANTED_UNAVAILABLE"},{status:503});}
}
export async function POST(request:Request) {
  let uid;try{uid=(await verifyFirebaseRequest(request)).localId;}catch{return Response.json({error:"AUTH_REQUIRED"},{status:401});}
  try{
    const b=await request.json();const now=new Date().toISOString();
    if(b.action==="create") {
      if(typeof b.title!=="string"||b.title.trim().length<3||b.title.length>100||typeof b.description!=="string"||b.description.length>1000||!validPeriod(b.from,b.to,circleToday()))throw Error("INVALID");
      const lock=await getFirestoreDocument(`wantedLocks/${uid}`);
      const current=(await queryRecords("wanted","ownerUid",uid)).filter(r=>r.status==="open"&&Date.parse(String(r.expiresAt))>Date.now());if(current.length>=5)throw Error("LIMIT");
      const profile=await getServerProfile(uid);if(!profile.place.id||!profile.name)throw Error("PROFILE_REQUIRED");
      const id=crypto.randomUUID();
      await commitFirestoreWrites([{update:{name:firestoreDocumentName(`wanted/${id}`),fields:encodeFields({ownerUid:uid,title:b.title.trim(),description:b.description.trim(),country:profile.country,place:profile.place,author:profile.name.split(/\s+/)[0],from:b.from,to:b.to,status:"open",offers:[],createdAt:now,expiresAt:new Date(Math.min(Date.now()+30*86400000,Date.parse(b.to+"T23:59:59Z"))).toISOString()})},currentDocument:{exists:false}},{update:{name:firestoreDocumentName(`wantedLocks/${uid}`),fields:{updatedAt:{timestampValue:now}}},currentDocument:lock?{updateTime:lock.updateTime}:{exists:false}}]);
    }else{
      if(!validListingId(b.id))throw Error("INVALID");const doc=await getFirestoreDocument(`wanted/${b.id}`);if(!doc)throw Error("MISSING");const data=decodeFields(doc.fields);
      if(b.action==="close") {if(data.ownerUid!==uid)return Response.json({error:"NOT_OWNER"},{status:403});data.status="closed";}
      else if(b.action==="offer") {
        if(data.ownerUid===uid||data.status!=="open"||Date.parse(String(data.expiresAt))<=Date.now()||!validListingId(b.listingId))throw Error("INVALID");
        const listing=await getFirestoreDocument(`listings/${b.listingId}`);if(listing?.fields?.ownerUid?.stringValue!==uid||listing.fields?.active?.booleanValue!==true)return Response.json({error:"NOT_OWNER"},{status:403});
        const offers=Array.isArray(data.offers)?data.offers as Array<Record<string,Json>>:[];
        if(!offers.some(o=>o.listingId===b.listingId)){if(offers.length>=20)throw Error("LIMIT");offers.push({listingId:b.listingId,createdAt:now});}data.offers=offers;
      }else throw Error("INVALID");
      await commitFirestoreWrites([{update:{name:firestoreDocumentName(`wanted/${b.id}`),fields:encodeFields(data)},currentDocument:{updateTime:doc.updateTime}}]);
    }
    return Response.json({ok:true},{headers});
  }catch{return Response.json({error:"WANTED_SAVE_FAILED"},{status:409});}
}
