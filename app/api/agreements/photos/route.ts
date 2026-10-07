import sharp from "sharp";
import { commitFirestoreWrites, firestoreDocumentName, getFirestoreDocument, verifyFirebaseRequest } from "@/lib/firebase-server";
import { agreementPhotoPath, deleteAgreementPhoto, putAgreementPhoto, readAgreementPhoto } from "@/lib/agreement-photo-storage";
import { MAX_AGREEMENT_PHOTOS, MAX_AGREEMENT_PHOTO_BYTES, type AgreementPhoto, type PhotoPhase } from "@/lib/agreement-photos";

export const runtime = "nodejs";
const privateHeaders = {"Cache-Control":"private, no-store, max-age=0",Vary:"Authorization"};
class PhotoError extends Error { constructor(public status:number, public code:string) { super(code); } }
function failure(cause:unknown) {
  const code = cause instanceof PhotoError ? cause.code : cause instanceof Error && ["PHOTO_STORAGE_ACCESS","PHOTO_STORAGE_UNAVAILABLE"].includes(cause.message) ? cause.message : cause instanceof Error && cause.message === "IDENTITY_CONFLICT" ? "PHOTO_CONFLICT" : "PHOTO_FAILED";
  return Response.json({error:code},{status:cause instanceof PhotoError ? cause.status : code === "PHOTO_CONFLICT" ? 409 : 503,headers:privateHeaders});
}
async function context(request:Request, edit=false) {
  let uid:string;
  try { uid = (await verifyFirebaseRequest(request)).localId; } catch { throw new PhotoError(401,"PHOTO_LOGIN"); }
  const url=new URL(request.url), id=url.searchParams.get("id"), phase=url.searchParams.get("phase"), photoId=url.searchParams.get("photoId");
  if (!id || !/^[A-Za-z0-9_-]{10,100}$/.test(id) || (phase !== "handover" && phase !== "return") || (photoId !== null && !/^[a-f0-9-]{36}$/.test(photoId))) throw new PhotoError(400,"PHOTO_INVALID");
  const doc=await getFirestoreDocument(`agreements/${id}`);
  if (!doc) throw new PhotoError(404,"PHOTO_NOT_FOUND");
  const f=doc.fields ?? {};
  // Read exact server-owned role UIDs, never accept a client-supplied owner/path.
  if (![f.borrowerUid?.stringValue,f.lenderUid?.stringValue].includes(uid)) throw new PhotoError(403,"PHOTO_FORBIDDEN");
  const retention=f.retentionUntil?.timestampValue ?? f.retentionUntil?.stringValue;
  if (retention && Date.parse(retention) < Date.now()) throw new PhotoError(410,"PHOTO_EXPIRED");
  const field=phase === "handover" ? "handoverPhotos" : "returnPhotos";
  const raw=f[field] as {arrayValue?:{values?:Array<{mapValue?:{fields?:Record<string,{stringValue?:string;integerValue?:string}>}}>}} | undefined;
  const photos:AgreementPhoto[]=(raw?.arrayValue?.values ?? []).map(v=>{
    const p=v.mapValue?.fields ?? {};
    return {id:p.id?.stringValue ?? "",uploadedBy:p.uploadedBy?.stringValue ?? "",createdAt:p.createdAt?.stringValue ?? "",bytes:Number(p.bytes?.integerValue),width:Number(p.width?.integerValue),height:Number(p.height?.integerValue)};
  });
  if (edit) {
    if (!doc.updateTime) throw new PhotoError(409,"PHOTO_CONFLICT");
    const status=f.requestStatus?.stringValue;
    if (f.returnedAt || ["declined","cancelled"].includes(status ?? "")) throw new PhotoError(409,"PHOTO_LOCKED");
    if (phase === "handover" && (f.borrowerSignature || f.lenderSignature) || phase === "return" && (f.borrowerReturnSignature || f.lenderReturnSignature)) throw new PhotoError(409,"PHOTO_LOCKED");
    if (phase === "return" ? !f.borrowerSignature || !f.lenderSignature : status !== "accepted") throw new PhotoError(409,"PHOTO_NOT_READY");
    if (!f.borrowerUid?.stringValue || !f.lenderUid?.stringValue || f.borrowerUid.stringValue === f.lenderUid.stringValue) throw new PhotoError(409,"PHOTO_NOT_READY");
  }
  return {uid,id,phase:phase as PhotoPhase,photoId,photos,field,updateTime:doc.updateTime!};
}
type Context = Awaited<ReturnType<typeof context>>;
async function save(c:Context, photos:AgreementPhoto[]) {
  const now=new Date().toISOString();
  const fields={
    [c.field]:{arrayValue:{values:photos.map(p=>({mapValue:{fields:Object.fromEntries(Object.entries(p).map(([k,v])=>[k,typeof v === "number" ? {integerValue:String(v)} : {stringValue:v}]))}}))}},
    updatedAt:{timestampValue:now},activityAt:{timestampValue:now},activityBy:{stringValue:c.uid},activityKind:{stringValue:"photos"},
  };
  await commitFirestoreWrites([{update:{name:firestoreDocumentName(`agreements/${c.id}`),fields},updateMask:{fieldPaths:Object.keys(fields)},currentDocument:{updateTime:c.updateTime}}]);
}
async function boundedBody(request:Request) {
  if (request.headers.get("content-type")?.split(";")[0] !== "image/jpeg") throw new PhotoError(415,"PHOTO_TYPE");
  if (Number(request.headers.get("content-length")) > MAX_AGREEMENT_PHOTO_BYTES) throw new PhotoError(413,"PHOTO_SIZE");
  const reader=request.body?.getReader(); if (!reader) throw new PhotoError(400,"PHOTO_INVALID");
  const chunks:Uint8Array[]=[]; let length=0;
  try { for (;;) { const {done,value}=await reader.read(); if (done) break; length+=value.byteLength; if(length>MAX_AGREEMENT_PHOTO_BYTES) {await reader.cancel();throw new PhotoError(413,"PHOTO_SIZE");} chunks.push(value); } }
  finally { reader.releaseLock(); }
  if (!length) throw new PhotoError(400,"PHOTO_INVALID");
  return Buffer.concat(chunks);
}
export async function GET(request:Request) {
  try {
    const c=await context(request);
    if (!c.photoId || !c.photos.some(p=>p.id===c.photoId)) throw new PhotoError(404,"PHOTO_NOT_FOUND");
    const body=await readAgreementPhoto(agreementPhotoPath(c.id,c.phase,c.photoId));
    if (!body) throw new PhotoError(404,"PHOTO_NOT_FOUND");
    return new Response(body,{headers:{...privateHeaders,"Content-Type":"image/jpeg","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; sandbox"}});
  } catch(cause) { return failure(cause); }
}
export async function POST(request:Request) {
  try {
    const c=await context(request,true);
    if (c.photos.length >= MAX_AGREEMENT_PHOTOS) throw new PhotoError(409,"PHOTO_LIMIT");
    const bytes=await boundedBody(request);
    let output:Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
    let image:Buffer;
    try {
      output=await sharp(bytes,{limitInputPixels:1600*1600,failOn:"warning"}).metadata();
      if (output.format !== "jpeg" || !output.width || !output.height || Math.max(output.width,output.height)>1600) throw new Error("invalid");
      // Decode and re-encode: reject malformed files and strip EXIF/GPS metadata.
      image=await sharp(bytes,{limitInputPixels:1600*1600,failOn:"warning"}).rotate().jpeg({quality:80}).toBuffer();
    } catch { throw new PhotoError(400,"PHOTO_INVALID"); }
    if (image.length>MAX_AGREEMENT_PHOTO_BYTES) throw new PhotoError(413,"PHOTO_SIZE");
    const photo:AgreementPhoto={id:crypto.randomUUID(),uploadedBy:c.uid,createdAt:new Date().toISOString(),bytes:image.length,width:output.width!,height:output.height!};
    const path=agreementPhotoPath(c.id,c.phase,photo.id);
    await putAgreementPhoto(path,image);
    const photos=[...c.photos,photo];
    try { await save(c,photos); }
    catch(cause) {
      // Delete only on a definitive failed precondition. An ambiguous network
      // error may have committed: never erase possibly signed evidence.
      if (cause instanceof Error && cause.message === "IDENTITY_CONFLICT") {
        try { await deleteAgreementPhoto(path); } catch { console.error("Agreement photo orphan cleanup failed"); }
      }
      throw cause;
    }
    return Response.json({photos},{headers:privateHeaders});
  } catch(cause) { return failure(cause); }
}
export async function DELETE(request:Request) {
  try {
    const c=await context(request,true);
    const photo=c.photos.find(p=>p.id===c.photoId);
    if (!photo) throw new PhotoError(404,"PHOTO_NOT_FOUND");
    if (photo.uploadedBy !== c.uid) throw new PhotoError(403,"PHOTO_OWNER");
    const photos=c.photos.filter(p=>p.id!==photo.id);
    // Detach with CAS BEFORE physical deletion. A racing signature wins or
    // fails on the same version, so signed evidence cannot be removed.
    await save(c,photos);
    try { await deleteAgreementPhoto(agreementPhotoPath(c.id,c.phase,photo.id)); }
    catch { console.error("Detached agreement photo cleanup failed"); }
    return Response.json({photos},{headers:privateHeaders});
  } catch(cause) { return failure(cause); }
}
