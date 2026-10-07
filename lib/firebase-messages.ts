"use client";

import { collection, limit, onSnapshot, orderBy, query, type Unsubscribe } from "firebase/firestore";
import { db } from "@/lib/firebase-client";
import { updateCircleAgreement } from "@/lib/firebase-agreements";

export type CircleMessage = {
  id: string;
  senderUid: string;
  text: string;
  createdAt: Date | null;
};

export function subscribeToCircleMessages(agreementId: string, onMessages: (messages: CircleMessage[]) => void, onError: (error: Error) => void): Unsubscribe {
  if (!db) { onError(new Error("Firebase er ikke konfigureret.")); return () => undefined; }
  const messages = collection(db, "agreements", agreementId, "messages");
  return onSnapshot(query(messages, orderBy("createdAt", "desc"), limit(200)), snapshot => {
    onMessages(snapshot.docs.map(item => {
      const data = item.data();
      return { id:item.id, senderUid:String(data.senderUid || ""), text:String(data.text || ""), createdAt:data.createdAt?.toDate?.() || null };
    }).reverse());
  }, error => onError(error));
}

export async function sendCircleMessage(agreementId: string, senderUid: string, text: string) {
  if (!db) throw new Error("Firebase er ikke konfigureret.");
  const clean = text.trim();
  if (!clean || clean.length > 2000) throw new Error("Beskeden skal være mellem 1 og 2.000 tegn.");
  if (!senderUid) throw new Error("Du skal være logget ind.");
  await updateCircleAgreement(agreementId,"message",{text:clean,messageId:crypto.randomUUID()});
}
