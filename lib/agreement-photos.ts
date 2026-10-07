export const MAX_AGREEMENT_PHOTOS = 2;
export const MAX_AGREEMENT_PHOTO_BYTES = 900 * 1024;
export type PhotoPhase = "handover" | "return";
export type AgreementPhoto = { id:string; uploadedBy:string; createdAt:string; bytes:number; width:number; height:number };
export type AgreementPhotos = { handoverPhotos?:AgreementPhoto[]; returnPhotos?:AgreementPhoto[] };
export function phasePhotos(agreement:AgreementPhotos, phase:PhotoPhase):AgreementPhoto[] {
  return (phase === "handover" ? agreement.handoverPhotos : agreement.returnPhotos) ?? [];
}
export function photoVersion(photos:AgreementPhoto[]):string { return photos.map(p=>p.id).sort().join(","); }
export function photosSeen(photos:AgreementPhoto[], ids:unknown):boolean {
  if (ids === undefined) return photos.length === 0; // Older clients may sign photo-free agreements.
  return Array.isArray(ids) && ids.length === photos.length && ids.every(id=>typeof id === "string") && [...ids].sort().join(",") === photoVersion(photos);
}
