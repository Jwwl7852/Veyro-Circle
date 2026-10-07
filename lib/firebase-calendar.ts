"use client";
import { auth } from "./firebase-client";
import type { CalendarBlock, Period } from "./listing-calendar";
export async function loadAvailability(ids:string[],signal?:AbortSignal):Promise<Record<string,Period[]|null>> {
  const result:Record<string,Period[]|null>={};
  for(let start=0;start<ids.length;start+=40) {
    const response=await fetch(`/api/availability?ids=${encodeURIComponent(ids.slice(start,start+40).join(","))}`,{cache:"no-store",signal});
    if(!response.ok)throw Error("CALENDAR_UNAVAILABLE");Object.assign(result,(await response.json()).periods);
  }
  return result;
}
async function ownerFetch(url:string,body?:unknown) {
  if(!auth?.currentUser)throw Error("AUTH_REQUIRED");
  const response=await fetch(url,{method:body?"POST":"GET",cache:"no-store",headers:{authorization:`Bearer ${await auth.currentUser.getIdToken()}`,"content-type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json();if(!response.ok)throw Error(data.error??"CALENDAR_UNAVAILABLE");return data;
}
export async function loadOwnerCalendar(id:string):Promise<{blocks:CalendarBlock[];booked:Period[]}> {return ownerFetch(`/api/availability?manage=1&id=${encodeURIComponent(id)}`);}
export async function changeCalendar(id:string,action:"add"|"remove",extra:{from?:string;to?:string;blockId?:string}) {await ownerFetch("/api/availability",{id,action,...extra});window.dispatchEvent(new Event("circle:calendar-changed"));}
