"use client";

import { doc, getDoc } from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "@/lib/firebase-client";
import { defaultSearchRadius, type Lang, type ListingPlan, type Profile } from "@/lib/marketplace";

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
    defaultRadiusKm: defaultSearchRadius(data.defaultRadiusKm),
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

export async function saveCircleProfile(user: User, profile: Profile, preferredLanguage: Lang) {
  const response = await fetch("/api/profile", {method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${await user.getIdToken()}`},body:JSON.stringify({...profile,preferredLanguage})});
  const data = await response.json() as {error?:string};
  if (!response.ok) throw new Error(data.error || "Profilen kunne ikke gemmes.");
}

export async function saveCircleLanguage(user:User,preferredLanguage:Lang) {
  const response=await fetch("/api/profile",{method:"PATCH",headers:{"content-type":"application/json",authorization:`Bearer ${await user.getIdToken()}`},body:JSON.stringify({preferredLanguage})});
  if(!response.ok)throw Error("LANGUAGE_SAVE_FAILED");
}
