"use client";

import { auth } from "@/lib/firebase-client";
import type { Country } from "@/lib/marketplace";

export type CommunityMapPoint = {
  country: Country;
  postcode: string;
  city: string;
  lat: number;
  lon: number;
  count: number;
};

export async function loadCommunityMap(): Promise<CommunityMapPoint[]> {
  if (!auth?.currentUser) throw new Error("Du skal være logget ind.");
  const response = await fetch("/api/community-map", {
    cache:"no-store",
    headers:{authorization:`Bearer ${await auth.currentUser.getIdToken()}`},
  });
  const data = await response.json() as {points?:CommunityMapPoint[];error?:string};
  if (!response.ok) throw new Error(data.error || "Circle-kortet kunne ikke hentes.");
  return data.points ?? [];
}
