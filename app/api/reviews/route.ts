import {getFirestoreDocument,getServerProfile,verifyFirebaseRequest,commitFirestoreWrites,firestoreDocumentName} from "@/lib/firebase-server";
import {decodeFields,encodeFields} from "@/lib/firestore-values";
import {queryRecords} from "@/lib/community-server";
import {agreementStage,type WorkflowAgreement} from "@/lib/agreement-workflow";
import {validListingId} from "@/lib/listing-calendar";
const headers={"cache-control":"no-store"};
export async function GET(request:Request) {
  try {
    const params=new URL(request.url).searchParams;
    const agreementId=params.get("agreementId");
    if(agreementId){
      let uid;try{uid=(await verifyFirebaseRequest(request)).localId;}catch{return Response.json({error:"AUTH_REQUIRED"},{status:401});}
      const doc=validListingId(agreementId)?await getFirestoreDocument(`agreements/${agreementId}`):null,a=decodeFields(doc?.fields);
      if(!doc||![a.borrowerUid,a.lenderUid].includes(uid))return Response.json({error:"NOT_PARTICIPANT"},{status:403});
      const rows=await queryRecords("reviews","agreementId",agreementId);
      return Response.json({reviews:rows.map(r=>({author:r.author,stars:r.stars,maxStars:r.maxStars??5,text:r.text,createdAt:r.createdAt,own:r.authorUid===uid})),reviewed:rows.some(r=>r.authorUid===uid)},{headers});
    }
    const id=params.get("listingId");if(!validListingId(id))return Response.json({error:"INVALID_ID"},{status:400});
    const listing=await getFirestoreDocument(`listings/${id}`);if(!listing)return Response.json({reviews:[]},{headers});
    const owner=listing.fields?.ownerUid?.stringValue;
    if(!owner)return Response.json({reviews:[],count:0,average:null},{headers});
    const candidates=await queryRecords("reviews","subjectUid",owner);
    const rows=(await Promise.all(candidates.map(async r=>{
      if(r.subjectRole==="lender")return r;
      if(r.subjectRole)return null;
      const agreement=await getFirestoreDocument(`agreements/${r.agreementId}`);
      return agreement?.fields?.lenderUid?.stringValue===owner?r:null;
    }))).filter((r):r is NonNullable<typeof r>=>r!==null);
    const reviews=rows.map(r=>({author:r.author,stars:r.stars,maxStars:r.maxStars??5,text:r.text,createdAt:r.createdAt})).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,50);
    return Response.json({reviews,count:rows.length,average:rows.length?rows.reduce((sum,r)=>sum+Number(r.stars)*6/Number(r.maxStars??5),0)/rows.length:null},{headers});
  }catch{return Response.json({error:"REVIEWS_UNAVAILABLE"},{status:503,headers});}
}
export async function POST(request:Request) {
  let uid;try{uid=(await verifyFirebaseRequest(request)).localId;}catch{return Response.json({error:"AUTH_REQUIRED"},{status:401});}
  try{
    const {id,stars,text}=await request.json();if(!validListingId(id)||!Number.isInteger(stars)||stars<1||stars>6||typeof text!=="string"||text.trim().length>600)return Response.json({error:"INVALID_REVIEW"},{status:400});
    const doc=await getFirestoreDocument(`agreements/${id}`),a=decodeFields(doc?.fields);
    if(!doc || ![a.lenderUid,a.borrowerUid].includes(uid))return Response.json({error:"NOT_PARTICIPANT"},{status:403});
    if(agreementStage(a as unknown as WorkflowAgreement)!=="returned")return Response.json({error:"RETURN_REQUIRED"},{status:409});
    if(typeof a.retentionUntil==="string"&&Date.parse(a.retentionUntil)<Date.now())return Response.json({error:"EXPIRED"},{status:410});
    const path=`reviews/${id}_${uid}`;if(await getFirestoreDocument(path))return Response.json({error:"ALREADY_REVIEWED"},{status:409});
    const profile=await getServerProfile(uid),subjectUid=a.lenderUid===uid?a.borrowerUid:a.lenderUid;
    await commitFirestoreWrites([{update:{name:firestoreDocumentName(path),fields:encodeFields({agreementId:id,listingId:(a.item as Record<string,string>).id,authorUid:uid,subjectUid,subjectRole:a.lenderUid===uid?"borrower":"lender",maxStars:6,author:profile.name.split(/\s+/)[0],stars,text:text.trim(),createdAt:new Date().toISOString()})},currentDocument:{exists:false}}]);
    return Response.json({ok:true},{headers});
  }catch{return Response.json({error:"REVIEW_SAVE_FAILED"},{status:409});}
}
