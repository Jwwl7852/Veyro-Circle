"use client";

import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase-client";
import type { Lang, ListingPlan, Profile } from "@/lib/marketplace";

export type CircleCloudProfile = Profile & {
  uid: string;
  preferredLanguage: Lang;
  verificationStatus: "pending" | "verified";
  subscriptionPlan: ListingPlan;
};

export async function loadCircleProfile(uid: string): Promise<CircleCloudProfile | null> {
  if (!db) return null;
  const snapshot = await getDoc(doc(db, "users", uid));
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  if (!data.place || !data.name || !data.street || !data.email) return null;
  return {
    uid,
    name: data.name,
    email: data.email,
    phone: typeof data.phone === "string" ? data.phone : "",
    street: data.street,
    place: data.place,
    taxAcknowledgement: data.taxAcknowledgement,
    preferredLanguage: data.preferredLanguage === "sv" ? "sv" : "da",
    verificationStatus: data.verificationStatus === "verified" ? "verified" : "pending",
    subscriptionPlan: data.subscriptionPlan === "plus" ? "plus" : "free",
  };
}

export async function saveCircleProfile(uid: string, profile: Profile, preferredLanguage: Lang) {
  if (!db) throw new Error("Firebase er ikke konfigureret.");
  const ref = doc(db, "users", uid);
  const existing = await getDoc(ref);
  const defaults = existing.exists() ? {} : {
    createdAt: serverTimestamp(),
    verificationStatus: "pending",
    subscriptionPlan: "free",
  };
  await setDoc(ref, {
    ...defaults,
    uid,
    name: profile.name,
    email: profile.email,
    phone: profile.phone,
    street: profile.street,
    place: profile.place,
    taxAcknowledgement: profile.taxAcknowledgement ?? null,
    preferredLanguage,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}
