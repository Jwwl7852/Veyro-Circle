"use client";
import { auth } from "@/lib/firebase-client";
import { agreementsChanged } from "@/lib/firebase-agreements";
import { compressListingImage } from "@/lib/image-compression";
import type { AgreementPhoto, PhotoPhase } from "@/lib/agreement-photos";

export function photoError(cause:unknown, lang:"da"|"sv") {
  const code=cause instanceof Error ? cause.message : "PHOTO_FAILED";
  const messages:Record<string,[string,string]>={
    PHOTO_LOGIN:["Log ind igen for at se eller gemme billeder.","Logga in igen för att se eller spara bilder."],
    PHOTO_LIMIT:["Der er plads til to billeder pr. fase.","Det finns plats för två bilder per fas."],
    PHOTO_LOCKED:["Billederne er låst, fordi aftalen er underskrevet eller afsluttet.","Bilderna är låsta eftersom avtalet är signerat eller avslutat."],
    PHOTO_NOT_READY:["Vent på godkendelsen eller underskrifterne fra forrige trin.","Vänta på godkännandet eller signaturerna från föregående steg."],
    PHOTO_CONFLICT:["Aftalen blev ændret samtidig. Opdatér aftalen og prøv igen.","Avtalet ändrades samtidigt. Uppdatera avtalet och försök igen."],
    PHOTO_STORAGE_ACCESS:["Billedlageret mangler serveradgang. Kontakt Veyro Circle; billedet er ikke gemt.","Bildlagringen saknar serveråtkomst. Kontakta Veyro Circle; bilden är inte sparad."],
    PHOTO_STORAGE_UNAVAILABLE:["Billedlageret kan ikke kontaktes lige nu. Prøv igen.","Bildlagringen kan inte nås just nu. Försök igen."],
    PHOTO_INVALID:["Billedet kunne ikke læses. Vælg et andet JPG-, PNG- eller WEBP-billede.","Bilden kunde inte läsas. Välj en annan JPG-, PNG- eller WEBP-bild."],
    PHOTO_SIZE:["Billedet er for stort. Vælg et mindre billede.","Bilden är för stor. Välj en mindre bild."],
    PHOTO_OWNER:["Du kan kun fjerne dine egne billeder.","Du kan bara ta bort dina egna bilder."],
    PHOTO_EXPIRED:["Aftalens opbevaringsperiode er udløbet.","Avtalets lagringstid har löpt ut."],
    PHOTO_NOT_FOUND:["Billedet findes ikke længere. Opdatér aftalen.","Bilden finns inte längre. Uppdatera avtalet."],
  };
  return (messages[code] ?? ["Billedet kunne ikke behandles. Prøv igen eller vælg en anden billedfil (JPG, PNG eller WEBP, højst 12 MB).","Bilden kunde inte behandlas. Försök igen eller välj en annan bildfil (JPG, PNG eller WEBP, högst 12 MB)."])[lang === "da" ? 0 : 1];
}
function url(id:string,phase:PhotoPhase,photoId?:string) { return `/api/agreements/photos?${new URLSearchParams({id,phase,...(photoId ? {photoId} : {})})}`; }
async function headers() {
  if (!auth?.currentUser) throw new Error("PHOTO_LOGIN");
  return {authorization:`Bearer ${await auth.currentUser.getIdToken()}`};
}
async function responsePhotos(response:Response):Promise<AgreementPhoto[]> {
  const data=await response.json();
  if (!response.ok) throw new Error(data.error ?? "PHOTO_FAILED");
  return data.photos;
}
export async function uploadAgreementPhoto(id:string,phase:PhotoPhase,file:File) {
  const compressed=await compressListingImage(file);
  const blob=await (await fetch(compressed.src)).blob();
  try { return await responsePhotos(await fetch(url(id,phase),{method:"POST",headers:{...await headers(),"content-type":"image/jpeg"},body:blob})); }
  finally { agreementsChanged(); }
}
export async function removeAgreementPhoto(id:string,phase:PhotoPhase,photoId:string) {
  try { return await responsePhotos(await fetch(url(id,phase,photoId),{method:"DELETE",headers:await headers()})); }
  finally { agreementsChanged(); }
}
export async function loadAgreementPhoto(id:string,phase:PhotoPhase,photoId:string,signal:AbortSignal) {
  const response=await fetch(url(id,phase,photoId),{headers:await headers(),cache:"no-store",signal});
  if (!response.ok) { const data=await response.json(); throw new Error(data.error ?? "PHOTO_FAILED"); }
  return response.blob();
}
