"use client";
import { app, auth } from "@/lib/firebase-client";
import { getMessaging, getToken, deleteToken, isSupported } from "firebase/messaging";

const key="circle-push-owner";
export const pushConfigured=Boolean(process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY);
export async function pushSupported() { return typeof Notification !== "undefined" && "serviceWorker" in navigator && await isSupported(); }
async function save(token:string,lang:string,remove=false,expectedUid=auth?.currentUser?.uid) {
  const user=auth?.currentUser;
  if (!user || user.uid !== expectedUid) throw new Error("AUTH_REQUIRED");
  const response=await fetch("/api/push",{method:remove ? "DELETE" : "POST",headers:{authorization:`Bearer ${await user.getIdToken()}`,"content-type":"application/json"},body:JSON.stringify({token,lang})});
  if (!response.ok) throw new Error("PUSH_SAVE_FAILED");
}
export async function enablePush(lang:string,ask=true) {
  if (!app || !auth?.currentUser || !pushConfigured || typeof Notification === "undefined") throw new Error("UNSUPPORTED");
  const uid=auth.currentUser.uid;
  if (ask && await Notification.requestPermission() !== "granted") throw new Error("DENIED");
  if (!await pushSupported()) throw new Error("UNSUPPORTED");
  if (Notification.permission !== "granted") throw new Error("DENIED");
  const registration=await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const token=await getToken(getMessaging(app),{vapidKey:process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,serviceWorkerRegistration:registration});
  if (!token) throw new Error("NO_TOKEN");
  await save(token,lang,false,uid);
  if(auth.currentUser?.uid !== uid) { await deleteToken(getMessaging(app)); throw new Error("AUTH_CHANGED"); }
  localStorage.setItem(key,uid);
}
export function hasPushConsent(uid:string) { return localStorage.getItem(key) === uid; }
export async function disablePush() {
  const owner=localStorage.getItem(key);
  if(!owner) return;
  if (!app || !await pushSupported()) { localStorage.removeItem(key); return; }
  // Delete the browser token even if the server cannot be reached on logout.
  const registration=await navigator.serviceWorker.getRegistration("/");
  if (!registration) { localStorage.removeItem(key); return; }
  let serverError=false;
  if (Notification.permission === "granted" && pushConfigured) {
    try { const token=await getToken(getMessaging(app),{vapidKey:process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,serviceWorkerRegistration:registration}); if(token) await save(token,"da",true); } catch { serverError=true; }
  }
  try { await deleteToken(getMessaging(app)); } catch {
    const subscription=await registration.pushManager.getSubscription();
    if(subscription && !await subscription.unsubscribe()) throw new Error("PUSH_DISABLE_FAILED");
  }
  localStorage.removeItem(key);
  if(serverError) console.warn("Push token removed locally; server registration expires automatically");
}

export async function maintainPush(uid:string,lang:string) {
  const owner=localStorage.getItem(key);
  if(!owner) return;
  if(owner !== uid) { await disablePush(); return; }
  if(!await pushSupported() || Notification.permission !== "granted") { await disablePush(); return; }
  const response=await fetch("/api/push",{cache:"no-store"});
  if((await response.json()).enabled) await enablePush(lang,false);
}
