import type { User } from "firebase/auth";

export async function openBilling(user: User, action: "checkout" | "portal") {
  const response = await fetch(`/api/stripe/${action}`, { method:"POST", headers:{authorization:`Bearer ${await user.getIdToken()}`} });
  const data = await response.json() as {url?:string;error?:string};
  if (!response.ok || !data.url) throw new Error(data.error || "Stripe kunne ikke åbnes");
  window.location.assign(data.url);
}
