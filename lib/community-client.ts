"use client";
import {auth} from "./firebase-client";
export async function communityFetch(url:string,body?:unknown) {
  if(!auth?.currentUser)throw Error("AUTH_REQUIRED");
  const response=await fetch(url,{method:body?"POST":"GET",cache:"no-store",headers:{authorization:`Bearer ${await auth.currentUser.getIdToken()}`,"content-type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json();if(!response.ok)throw Error(data.error??"SAVE_FAILED");return data;
}
