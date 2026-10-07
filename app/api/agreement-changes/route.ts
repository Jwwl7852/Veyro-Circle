import {verifyFirebaseRequest,getFirestoreDocument,commitFirestoreWrites,firestoreDocumentName} from "@/lib/firebase-server";
import {queryRecords} from "@/lib/community-server";
import {decodeFields,encodeFields,type Json} from "@/lib/firestore-values";
import {blockedPeriods} from "@/lib/listing-calendar-server";
import {validListingId,validPeriod} from "@/lib/listing-calendar";
import {agreementStage,overlaps,reservesDates,circleToday,type WorkflowAgreement} from "@/lib/agreement-workflow";
import {validTime,type Extension} from "@/lib/agreement-schedule";
import {dayCount} from "@/lib/marketplace";
export async function POST(request:Request) {
  let uid;try{uid=(await verifyFirebaseRequest(request)).localId;}catch{return Response.json({error:"AUTH_REQUIRED"},{status:401});}
  try{
    const b=await request.json();if(!validListingId(b.id))throw Error("INVALID_ID");
    const doc=await getFirestoreDocument(`agreements/${b.id}`),a=decodeFields(doc?.fields);
    if(!doc || ![a.borrowerUid,a.lenderUid].includes(uid))return Response.json({error:"NOT_PARTICIPANT"},{status:403});
    if(!["accepted","handedOver"].includes(agreementStage(a as unknown as WorkflowAgreement))||a.borrowerReturnSignature||a.lenderReturnSignature||typeof a.retentionUntil==="string"&&Date.parse(a.retentionUntil)<Date.now())throw Error("CHANGE_NOT_ALLOWED");
    const item=a.item as Record<string,Json>,proposal=a.changeProposal as unknown as Extension|undefined,now=new Date().toISOString();
    const fields:Record<string,Json>={updatedAt:now,activityAt:now,activityBy:uid,activityKind:"updated"};
    const extra:unknown[]=[];
    if(b.action==="propose"){
      const start=String(a.from),days=dayCount(start,b.to);
      if(proposal || !validTime(b.returnTime)||!days||days>366||typeof b.to!=="string"||b.to<=String(a.to)||!validPeriod(circleToday(),b.to,circleToday()))throw Error("INVALID_EXTENSION");
      if(!Number.isSafeInteger(item.dailyPrice)||Number(item.dailyPrice)<0)throw Error("INVALID_PRICE");
      if(Array.isArray(a.extensions)&&a.extensions.length>=10)throw Error("EXTENSION_LIMIT");
      fields.changeProposal={id:crypto.randomUUID(),fromTo:String(a.to),to:b.to,returnTime:b.returnTime,total:days*Number(item.dailyPrice),proposedBy:uid,proposedAt:now};
    }else if(b.action==="decline"){
      if(!proposal || b.proposalId!==proposal.id)throw Error("STALE_PROPOSAL");fields.changeProposal=null;
    }else if(b.action==="accept"){
      if(!proposal||b.proposalId!==proposal.id||proposal.proposedBy===uid||proposal.fromTo!==a.to||proposal.to<circleToday())throw Error("STALE_PROPOSAL");
      const id=String(item.id),listing=await getFirestoreDocument(`listings/${id}`);if(listing?.fields?.ownerUid?.stringValue!==a.lenderUid||listing.fields?.active?.booleanValue!==true)throw Error("LISTING_MISSING");
      const lock=await getFirestoreDocument(`bookingLocks/${id}`);
      const range={from:String(a.from),to:proposal.to};
      if((await blockedPeriods(id)).some(p=>overlaps(p,range)))throw Error("BOOKING_CONFLICT");
      if((await queryRecords("agreements","item.id",id)).some(other=>other.id!==b.id&&reservesDates(other as unknown as WorkflowAgreement)&&overlaps(other as unknown as WorkflowAgreement,range)))throw Error("BOOKING_CONFLICT");
      Object.assign(fields,{originalTo:a.originalTo??a.to,originalTotal:a.originalTotal??a.total,originalReturnTime:a.originalReturnTime??a.returnTime??"",to:proposal.to,returnTime:proposal.returnTime,days:dayCount(String(a.from),proposal.to),total:proposal.total,changeProposal:null,extensions:[...(Array.isArray(a.extensions)?a.extensions:[]),{...proposal,acceptedBy:uid,acceptedAt:now}]});
      extra.push({verify:firestoreDocumentName(`listings/${id}`),currentDocument:{updateTime:listing.updateTime}},{update:{name:firestoreDocumentName(`bookingLocks/${id}`),fields:{updatedAt:{timestampValue:now}}},currentDocument:lock?{updateTime:lock.updateTime}:{exists:false}});
    }else throw Error("INVALID_ACTION");
    await commitFirestoreWrites([{update:{name:firestoreDocumentName(`agreements/${b.id}`),fields:encodeFields(fields)},updateMask:{fieldPaths:Object.keys(fields)},currentDocument:{updateTime:doc.updateTime}},...extra]);
    return Response.json({ok:true},{headers:{"cache-control":"private, no-store"}});
  }catch(cause){return Response.json({error:cause instanceof Error?cause.message:"CHANGE_FAILED"},{status:409});}
}
