"use client";

import { collection, doc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { db } from "@/lib/firebase-client";
import type { Country, Place, Profile } from "@/lib/marketplace";

export type StoredSignature = { dataUrl: string; signedAt: string };
export type StoredAgreement = {
  id: string;
  borrowerUid: string;
  lenderUid: string;
  participantUids: string[];
  borrower: Profile;
  lender: { name: string; street: string; phone: string; place: Place };
  item: { id: number; name: string; category: string; country: Country; dailyPrice: number };
  from: string;
  to: string;
  days: number;
  total: number;
  deposit: number;
  message: string;
  borrowerSignature?: StoredSignature;
  lenderSignature?: StoredSignature;
};

export async function saveCircleAgreement(agreement: StoredAgreement) {
  if (!db) throw new Error("Firebase er ikke konfigureret.");
  const clean = JSON.parse(JSON.stringify(agreement)) as StoredAgreement;
  await setDoc(doc(db, "agreements", agreement.id), { ...clean, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}

export async function loadCircleAgreements(uid: string): Promise<StoredAgreement[]> {
  if (!db) return [];
  const snapshot = await getDocs(query(collection(db, "agreements"), where("participantUids", "array-contains", uid)));
  return snapshot.docs.map(item => item.data() as StoredAgreement).sort((a,b) => b.id.localeCompare(a.id));
}

export async function saveCircleSignature(id: string, role: "borrower" | "lender", signature: StoredSignature) {
  if (!db) throw new Error("Firebase er ikke konfigureret.");
  await updateDoc(doc(db, "agreements", id), { [role === "borrower" ? "borrowerSignature" : "lenderSignature"]: signature, updatedAt: serverTimestamp() });
}
