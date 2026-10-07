import { verifyFirebaseRequest, commitFirestoreWrites, firestoreDocumentName, getFirestoreDocument } from "@/lib/firebase-server";
import { pushId, validPushToken } from "@/lib/push-server";

const headers={"cache-control":"private, no-store"};
export async function GET() { return Response.json({enabled:process.env.CIRCLE_PUSH_ENABLED === "true"},{headers}); }
async function update(request:Request,remove:boolean) {
  let uid:string;
  try { uid=(await verifyFirebaseRequest(request)).localId; } catch { return Response.json({error:"AUTH_REQUIRED"},{status:401,headers}); }
  try {
    if (Number(request.headers.get("content-length")) > 6000) return Response.json({error:"INVALID_TOKEN"},{status:400,headers});
    const {token,lang}=await request.json();
    if (!validPushToken(token)) return Response.json({error:"INVALID_TOKEN"},{status:400,headers});
    const path=`pushDevices/${pushId(token)}`;
    const old=await getFirestoreDocument(path);
    if (remove) {
      if (old?.fields?.uid?.stringValue === uid) await commitFirestoreWrites([{delete:firestoreDocumentName(path),currentDocument:{updateTime:old.updateTime}}]);
    } else {
      if (process.env.CIRCLE_PUSH_ENABLED !== "true") return Response.json({error:"PUSH_NOT_CONFIGURED"},{status:503,headers});
      await commitFirestoreWrites([{update:{name:firestoreDocumentName(path),fields:{uid:{stringValue:uid},token:{stringValue:token},lang:{stringValue:lang === "sv" ? "sv" : "da"},updatedAt:{timestampValue:new Date().toISOString()},expiresAt:{timestampValue:new Date(Date.now()+30*86400000).toISOString()}}},currentDocument:old ? {updateTime:old.updateTime} : {exists:false}}]);
    }
    return Response.json({ok:true},{headers});
  } catch { return Response.json({error:"PUSH_SAVE_FAILED"},{status:500,headers}); }
}
export const POST=(request:Request)=>update(request,false);
export const DELETE=(request:Request)=>update(request,true);
