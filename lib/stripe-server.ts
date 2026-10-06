import { serverConfig } from "@/lib/server-config";

export async function stripeRequest(path: string, body: URLSearchParams) {
  const response = await fetch(`https://api.stripe.com/v1${path}`, { method:"POST", headers:{authorization:`Bearer ${serverConfig("STRIPE_SECRET_KEY")}`,"content-type":"application/x-www-form-urlencoded"}, body });
  const data = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof data.error === "object" && data.error && "message" in data.error ? String((data.error as {message:unknown}).message) : "Stripe kunne ikke gennemføre handlingen");
  return data;
}

function hex(bytes: Uint8Array) { return Array.from(bytes).map(byte=>byte.toString(16).padStart(2,"0")).join(""); }
function safeEqual(a: string, b: string) { if (a.length !== b.length) return false; let result=0; for(let i=0;i<a.length;i++) result |= a.charCodeAt(i)^b.charCodeAt(i); return result===0; }

export async function verifyStripeWebhook(payload: string, signatureHeader: string | null) {
  if (!signatureHeader) throw new Error("Stripe-signatur mangler");
  const parts = signatureHeader.split(",").map(part=>part.split("="));
  const timestamp = parts.find(([key])=>key==="t")?.[1];
  const signatures = parts.filter(([key])=>key==="v1").map(([,value])=>value);
  if (!timestamp || Math.abs(Date.now()/1000-Number(timestamp)) > 300) throw new Error("Stripe-signaturen er udløbet");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(serverConfig("STRIPE_WEBHOOK_SECRET")), {name:"HMAC",hash:"SHA-256"}, false, ["sign"]);
  const digest = hex(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${payload}`))));
  if (!signatures.some(value=>safeEqual(value,digest))) throw new Error("Stripe-signaturen er ugyldig");
  return JSON.parse(payload) as { type:string; data:{object:Record<string, unknown>} };
}
