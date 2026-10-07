"use client";

import { auth } from "@/lib/firebase-client";
import type { Country, Place, Profile } from "@/lib/marketplace";
import type { Decision, WorkflowAgreement } from "@/lib/agreement-workflow";

export type StoredSignature = { dataUrl: string; signedAt: string };
export type SignaturePhase = "handover" | "return";
export type StoredAgreement = WorkflowAgreement & {
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
  const data = await response.json() as {error?:string;agreement:StoredAgreement};
  if (!response.ok) throw new Error(data.error || "Aftalen kunne ikke gemmes.");
  agreementsChanged();
  return data.agreement;
}

export async function loadCircleAgreements(uid: string): Promise<StoredAgreement[]> {
  if (!auth?.currentUser || auth.currentUser.uid !== uid) return [];
  const response = await fetch("/api/agreements",{cache:"no-store",headers:{authorization:`Bearer ${await auth.currentUser.getIdToken()}`}});
  const data = await response.json() as {agreements?:StoredAgreement[];error?:string};
  if (!response.ok) throw new Error(data.error || "Aftalerne kunne ikke hentes.");
  return (data.agreements ?? []).sort((a,b) => (b.createdAt ?? b.from).localeCompare(a.createdAt ?? a.from));
}

export function agreementsChanged() { window.dispatchEvent(new Event("circle:agreements-changed")); }

export async function loadBookedPeriods(listingId:string): Promise<Array<{from:string;to:string}>> {
  if (!auth?.currentUser) throw new Error("Du skal være logget ind.");
  const response = await fetch(`/api/agreements?listingId=${encodeURIComponent(listingId)}`,{cache:"no-store",headers:{authorization:`Bearer ${await auth.currentUser.getIdToken()}`}});
  const data = await response.json() as {periods?:Array<{from:string;to:string}>;error?:string};
  if (!response.ok) throw new Error(data.error || "Bookingerne kunne ikke hentes.");
  return data.periods ?? [];
}

export async function updateCircleAgreement(id:string, action:Decision|"read"|"message", extra:Record<string,unknown> = {}) {
  if (!auth?.currentUser) throw new Error("Du skal være logget ind.");
  const response = await fetch("/api/agreements", {method:"PATCH",headers:{"content-type":"application/json",authorization:`Bearer ${await auth.currentUser.getIdToken()}`},body:JSON.stringify({id,action,...extra})});
  const data = await response.json() as {error?:string};
  if (!response.ok) { agreementsChanged(); throw new Error(data.error || "Aftalen kunne ikke opdateres."); }
  agreementsChanged();
}

export async function saveCircleSignature(id: string, role: "borrower" | "lender", signature: StoredSignature, phase: SignaturePhase = "handover", seenNote = "") {
  if (!auth?.currentUser) throw new Error("Du skal være logget ind.");
  const response = await fetch("/api/agreements",{method:"PATCH",headers:{"content-type":"application/json",authorization:`Bearer ${await auth.currentUser.getIdToken()}`},body:JSON.stringify({id,action:"signature",role,phase,signature,seenNote})});
  const data = await response.json() as {error?:string;returnedAt?:string;returnCondition?:"good"|"remarks"};
  if (!response.ok) throw new Error(data.error || "Underskriften kunne ikke gemmes.");
  agreementsChanged();
  return data;
}

export async function saveCircleAgreementNote(id: string, phase: SignaturePhase, note: string) {
  if (!auth?.currentUser) throw new Error("Du skal være logget ind.");
  const response = await fetch("/api/agreements",{method:"PATCH",headers:{"content-type":"application/json",authorization:`Bearer ${await auth.currentUser.getIdToken()}`},body:JSON.stringify({id,action:"note",phase,note})});
  const data = await response.json() as {error?:string;note?:string};
  if (!response.ok) throw new Error(data.error || "Noten kunne ikke gemmes.");
  agreementsChanged();
  return data.note ?? "";
}
