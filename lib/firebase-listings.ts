"use client";

import { collection, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/lib/firebase-client";
import { deleteListingImage, uploadListingImage } from "@/lib/firebase-storage";
import type { CompressedListingImage } from "@/lib/image-compression";
import type { Country, Place } from "@/lib/marketplace";

export type CircleListingRecord = {
  id: string;
  ownerUid: string;
  owner: string;
  name: string;
  description: string;
  category: string;
  country: Country;
  city: string;
  place: Place;
  dailyPrice: number;
  deposit: number;
  photos: CompressedListingImage[];
  active: boolean;
  details?:Record<string,string>;
  createdAt?:string;
};

export type CircleListingDraft = Omit<CircleListingRecord, "ownerUid" | "owner" | "active">;
export type CircleListingContact = { name:string; street:string; phone:string; place:Place };

function cleanRecord(id: string, value: Record<string, unknown>): CircleListingRecord | null {
  const place = value.place as Place | undefined;
  if (!value.active || typeof value.ownerUid !== "string" || typeof value.name !== "string" || !place?.id || !["DK", "SE"].includes(place.country)) return null;
  const photos = Array.isArray(value.photos) ? value.photos.filter(photo => {
    const candidate = photo as Partial<CompressedListingImage>;
    return typeof candidate.src === "string" && typeof candidate.storagePath === "string";
  }) as CompressedListingImage[] : [];
  return {
    id,
    ownerUid:value.ownerUid,
    owner:typeof value.owner === "string" ? value.owner : "",
    name:value.name,
    description:typeof value.description === "string" ? value.description : "",
    category:typeof value.category === "string" ? value.category : "tools",
    country:place.country,
    city:place.city,
    place,
    dailyPrice:typeof value.dailyPrice === "number" ? value.dailyPrice : 0,
    deposit:typeof value.deposit === "number" ? value.deposit : 0,
    photos:photos.slice(0, 2),
    active:true,
    details:typeof value.details === "object" && value.details ? value.details as Record<string,string> : {},
    createdAt:typeof value.createdAt === "string" ? value.createdAt : value.createdAt && typeof value.createdAt === "object" && "toDate" in value.createdAt ? (value.createdAt as {toDate:()=>Date}).toDate().toISOString() : "",
  };
}

export function subscribeToCircleListings(onChange: (listings: CircleListingRecord[]) => void, onError: (error: Error) => void) {
  if (!db) throw new Error("Firebase Firestore er ikke konfigureret");
  return onSnapshot(collection(db, "listings"), snapshot => {
    const listings = snapshot.docs.flatMap(document => {
      const record = cleanRecord(document.id, document.data());
      return record ? [record] : [];
    });
    onChange(listings);
  }, error => onError(error));
}

async function authorizedFetch(input: string, init: RequestInit) {
  if (!auth?.currentUser) throw new Error("Du skal være logget ind.");
  const response = await fetch(input, {
    ...init,
    headers:{"content-type":"application/json", authorization:`Bearer ${await auth.currentUser.getIdToken()}`, ...(init.headers ?? {})},
  });
  const data = await response.json() as { error?:string };
  if (!response.ok) throw new Error(data.error || "Annoncen kunne ikke gemmes.");
  return data;
}

export async function saveCircleListing(draft: CircleListingDraft, previousPhotos: CompressedListingImage[] = []) {
  const user = auth?.currentUser;
  if (!user) throw new Error("Du skal være logget ind.");
  const id = draft.id || crypto.randomUUID();
  const uploadedPaths: string[] = [];
  try {
    const photos: CompressedListingImage[] = [];
    for (const [index, photo] of draft.photos.slice(0, 2).entries()) {
      if (photo.storagePath && !photo.src.startsWith("data:")) { photos.push(photo); continue; }
      const blob = await fetch(photo.src).then(response => response.blob());
      const uploaded = await uploadListingImage(user.uid, id, blob, index as 0 | 1);
      uploadedPaths.push(uploaded.storagePath);
      photos.push({...photo, ...uploaded});
    }
    await authorizedFetch("/api/listings", {method:"POST", body:JSON.stringify({listing:{...draft,id,photos}})});
    const retained = new Set(photos.map(photo => photo.storagePath));
    await Promise.allSettled(previousPhotos.filter(photo => photo.storagePath && !retained.has(photo.storagePath)).map(photo => deleteListingImage(user.uid, photo.storagePath!)));
    return id;
  } catch (error) {
    await Promise.allSettled(uploadedPaths.map(path => deleteListingImage(user.uid, path)));
    throw error;
  }
}

export async function deleteCircleListing(listing: Pick<CircleListingRecord, "id" | "ownerUid" | "photos">) {
  const user = auth?.currentUser;
  if (!user || listing.ownerUid !== user.uid) throw new Error("Du kan kun slette dine egne annoncer.");
  await authorizedFetch(`/api/listings?id=${encodeURIComponent(listing.id)}`, {method:"DELETE"});
  await Promise.allSettled(listing.photos.filter(photo => photo.storagePath).map(photo => deleteListingImage(user.uid, photo.storagePath!)));
}

export async function loadCircleListingContact(id: string): Promise<CircleListingContact> {
  if (!auth?.currentUser) throw new Error("Du skal være logget ind.");
  const response = await fetch(`/api/listings?id=${encodeURIComponent(id)}`, {headers:{authorization:`Bearer ${await auth.currentUser.getIdToken()}`}});
  const data = await response.json() as {contact?:CircleListingContact;error?:string};
  if (!response.ok || !data.contact) throw new Error(data.error || "Ejerens aftaleoplysninger kunne ikke hentes.");
  return data.contact;
}
