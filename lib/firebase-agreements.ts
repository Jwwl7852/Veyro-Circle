"use client";

import { auth } from "@/lib/firebase-client";
import type { Country, Place, Profile } from "@/lib/marketplace";

export type StoredSignature = { dataUrl: string; signedAt: string };
export type SignaturePhase = "handover" | "return";
export type StoredAgreement = {
  id: string;
  borrowerUid: string;
  lenderUid?: string;
  participantUids: string[];
  borrower: Profile;
  lender: { name: string; street: string; phone: string; place: Place };
  item: { id: string; name: string; category: string; country: Country; dailyPrice: number };
  from: string;
  to: string;
  days: number;
  total: number;
  deposit: number;
  message: string;
  handoverNote?: string;
  returnNote?: string;
  borrowerSignature?: StoredSignature;
  lenderSignature?: StoredSignature;
  borrowerReturnSignature?: StoredSignature;
  lenderReturnSignature?: StoredSignature;
  returnedAt?: string;
  returnCondition?: "good" | "remarks";
};

export async function saveCircleAgreement(agreement: StoredAgreement) {
  if (!auth?.currentUser) throw new Error("Du skal være logget ind.");
  const clean = JSON.parse(JSON.stringify(agreement)) as StoredAgreement;
  const response = await fetch("/api/agreements",{method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${await auth.currentUser.getIdToken()}`},body:JSON.stringify({agreement:clean})});
  const data = await response.json() as {error?:string};
  if (!response.ok) throw new Error(data.error || "Aftalen kunne ikke gemmes.");
}

export async function loadCircleAgreements(uid: string): Promise<StoredAgreement[]> {
  if (!auth?.currentUser || auth.currentUser.uid !== uid) return [];
  const response = await fetch("/api/agreements",{headers:{authorization:`Bearer ${await auth.currentUser.getIdToken()}`}});
  const data = await response.json() as {agreements?:StoredAgreement[];error?:string};
  if (!response.ok) throw new Error(data.error || "Aftalerne kunne ikke hentes.");
  return (data.agreements ?? []).sort((a,b) => b.id.localeCompare(a.id));
}

export async function saveCircleSignature(id: string, role: "borrower" | "lender", signature: StoredSignature, phase: SignaturePhase = "handover") {
  if (!auth?.currentUser) throw new Error("Du skal være logget ind.");
  const response = await fetch("/api/agreements",{method:"PATCH",headers:{"content-type":"application/json",authorization:`Bearer ${await auth.currentUser.getIdToken()}`},body:JSON.stringify({id,action:"signature",role,phase,signature})});
  const data = await response.json() as {error?:string;returnedAt?:string;returnCondition?:"good"|"remarks"};
  if (!response.ok) throw new Error(data.error || "Underskriften kunne ikke gemmes.");
  return data;
}

export async function saveCircleAgreementNote(id: string, phase: SignaturePhase, note: string) {
  if (!auth?.currentUser) throw new Error("Du skal være logget ind.");
  const response = await fetch("/api/agreements",{method:"PATCH",headers:{"content-type":"application/json",authorization:`Bearer ${await auth.currentUser.getIdToken()}`},body:JSON.stringify({id,action:"note",phase,note})});
  const data = await response.json() as {error?:string;note?:string};
  if (!response.ok) throw new Error(data.error || "Noten kunne ikke gemmes.");
  return data.note ?? "";
}
