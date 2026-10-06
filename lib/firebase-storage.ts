import { ref, uploadBytes, deleteObject } from "firebase/storage";
import { storage } from "@/lib/firebase-client";
export async function uploadListingImage(uid: string, listingId: string, file: File, index: 0 | 1) {
  if (!storage) throw new Error("Firebase Storage er ikke konfigureret");
  if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) throw new Error("Ugyldigt billede");
  const path = `users/${uid}/listings/${listingId}/${index}-${crypto.randomUUID()}`;
  const snapshot = await uploadBytes(ref(storage, path), file, { contentType:file.type, customMetadata:{ownerUid:uid,listingId} });
  return snapshot.ref.fullPath;
}
export async function deleteListingImage(uid: string, fullPath: string) {
  if (!storage || !fullPath.startsWith(`users/${uid}/listings/`)) throw new Error("Adgang nægtet");
  await deleteObject(ref(storage, fullPath));
}
