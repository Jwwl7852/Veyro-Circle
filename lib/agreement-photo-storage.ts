import { serviceToken } from "@/lib/firebase-server";
import { serverConfig } from "@/lib/server-config";
import type { PhotoPhase } from "@/lib/agreement-photos";

// Never use Firebase public download tokens for private agreement evidence.
export function agreementPhotoPath(id:string, phase:PhotoPhase, photoId:string) {
  return `agreement-evidence/${id}/${phase}/${photoId}.jpg`;
}
function bucket() { return encodeURIComponent(serverConfig("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET")); }
function objectUrl(path:string) { return `https://storage.googleapis.com/storage/v1/b/${bucket()}/o/${encodeURIComponent(path)}`; }
async function headers() { return {authorization:`Bearer ${await serviceToken("storage")}`}; }
function storageFailure(status:number) {
  return new Error(status === 401 || status === 403 ? "PHOTO_STORAGE_ACCESS" : "PHOTO_STORAGE_UNAVAILABLE");
}
export async function putAgreementPhoto(path:string, bytes:Uint8Array) {
  const boundary = `circle_${crypto.randomUUID()}`;
  const metadata = {name:path,contentType:"image/jpeg",cacheControl:"private, no-store, max-age=0"};
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: image/jpeg\r\n\r\n`,
    new Uint8Array(bytes), `\r\n--${boundary}--\r\n`,
  ]);
  const response = await fetch(`https://storage.googleapis.com/upload/storage/v1/b/${bucket()}/o?uploadType=multipart&ifGenerationMatch=0`, {
    method:"POST",headers:{...await headers(),"content-type":`multipart/related; boundary=${boundary}`},body,
  });
  if (!response.ok) throw storageFailure(response.status);
}
export async function readAgreementPhoto(path:string) {
  const response = await fetch(`${objectUrl(path)}?alt=media`,{headers:await headers(),cache:"no-store"});
  if (response.status === 404) return null;
  if (!response.ok) throw storageFailure(response.status);
  return response.body;
}
export async function deleteAgreementPhoto(path:string) {
  const response = await fetch(objectUrl(path),{method:"DELETE",headers:await headers()});
  if (!response.ok && response.status !== 404) throw storageFailure(response.status);
}
