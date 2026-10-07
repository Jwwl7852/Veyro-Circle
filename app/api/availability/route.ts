import { verifyFirebaseRequest, getFirestoreDocument, commitFirestoreWrites, firestoreDocumentName } from "@/lib/firebase-server";
import { bookedPeriods, unavailablePeriods } from "@/lib/listing-calendar-server";
import { readBlocks, encodeBlocks, validPeriod, validListingId, type CalendarBlock } from "@/lib/listing-calendar";
import { circleToday, overlaps } from "@/lib/agreement-workflow";
const headers={"cache-control":"no-store"};
const error=(code:string,status=400)=>Response.json({error:code},{status,headers});
export async function GET(request:Request) {
  try {
    const params=new URL(request.url).searchParams;
    if(params.get("manage")==="1") {
      let uid;try {uid=(await verifyFirebaseRequest(request)).localId;}catch{return error("AUTH_REQUIRED",401);}
      const id=params.get("id");if(!validListingId(id))return error("INVALID_ID");
      const listing=await getFirestoreDocument(`listings/${id}`);
      if(listing?.fields?.ownerUid?.stringValue!==uid)return error("NOT_OWNER",403);
      const calendar=await getFirestoreDocument(`listingCalendars/${id}`);
      return Response.json({blocks:readBlocks(calendar?.fields).filter(b=>b.to>=circleToday()),booked:await bookedPeriods(id)},{headers});
    }
    const ids=[...new Set((params.get("ids")??"").split(","))];
    if(!ids.length || ids.length>40 || !ids.every(validListingId))return error("INVALID_IDS");
    const entries=await Promise.all(ids.map(async id=>{
      const listing=await getFirestoreDocument(`listings/${id}`);
      if(!listing || listing.fields?.active?.booleanValue!==true)return [id,null];
      return [id,await unavailablePeriods(id)];
    }));
    return Response.json({periods:Object.fromEntries(entries)},{headers});
  } catch {return error("CALENDAR_UNAVAILABLE",503);}
}
export async function POST(request:Request) {
  let uid;try {uid=(await verifyFirebaseRequest(request)).localId;}catch{return error("AUTH_REQUIRED",401);}
  try {
    const {id,action,from,to,blockId}=await request.json();
    if(!validListingId(id) || !["add","remove"].includes(action))return error("INVALID_REQUEST");
    const listing=await getFirestoreDocument(`listings/${id}`);
    if(!listing || listing.fields?.active?.booleanValue!==true || listing.fields?.ownerUid?.stringValue!==uid)return error("NOT_OWNER",403);
    // Same lock as booking approval, read before querying reservations.
    const lock=await getFirestoreDocument(`bookingLocks/${id}`);
    const calendar=await getFirestoreDocument(`listingCalendars/${id}`);
    let blocks=readBlocks(calendar?.fields).filter(b=>b.to>=circleToday());
    if(action === "add") {
      if(!validPeriod(from,to,circleToday()))return error("INVALID_DATES");
      if(blocks.some(b=>b.from===from && b.to===to))return Response.json({ok:true,blocks},{headers});
      if(blocks.length>=100)return error("TOO_MANY_BLOCKS");
      if((await bookedPeriods(id)).some(b=>overlaps(b,{from,to})))return error("BOOKING_CONFLICT",409);
      blocks.push({id:crypto.randomUUID(),from,to} as CalendarBlock);
    } else {
      if(typeof blockId!=="string")return error("INVALID_BLOCK");
      blocks=blocks.filter(b=>b.id!==blockId);
    }
    await commitFirestoreWrites([
      {verify:firestoreDocumentName(`listings/${id}`),currentDocument:{updateTime:listing.updateTime}},
      {update:{name:firestoreDocumentName(`bookingLocks/${id}`),fields:{updatedAt:{timestampValue:new Date().toISOString()}}},currentDocument:lock?{updateTime:lock.updateTime}:{exists:false}},
      {update:{name:firestoreDocumentName(`listingCalendars/${id}`),fields:{blocks:encodeBlocks(blocks),updatedAt:{timestampValue:new Date().toISOString()}}},currentDocument:calendar?{updateTime:calendar.updateTime}:{exists:false}},
    ]);
    return Response.json({ok:true,blocks},{headers});
  } catch(cause) {return error(cause instanceof Error && cause.message === "IDENTITY_CONFLICT" ? "CALENDAR_CHANGED" : "CALENDAR_SAVE_FAILED",409);}
}
