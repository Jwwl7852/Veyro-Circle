import { serverConfig } from "@/lib/server-config";

type FirebaseIdentity = { localId: string; email: string; emailVerified: boolean };
export type FirestoreField = { stringValue?: string; booleanValue?: boolean; doubleValue?: number; timestampValue?: string; mapValue?: { fields?: Record<string, FirestoreField> } };
const cachedTokens = new Map<string, { value: string; expiresAt: number }>();

function b64url(value: string | Uint8Array) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export async function serviceToken(scope: "datastore" | "storage" = "datastore") {
  const cachedToken = cachedTokens.get(scope);
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const email = serverConfig("FIREBASE_SERVICE_ACCOUNT_EMAIL");
  let rawKey = serverConfig("FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY").trim();
  // Netlify accepts both a raw multiline PEM and the JSON-escaped value copied
  // directly from a Firebase service-account file (optionally with quotes).
  if (rawKey.startsWith('"') && rawKey.endsWith('"')) {
    try { rawKey = JSON.parse(rawKey) as string; }
    catch { rawKey = rawKey.slice(1, -1); }
  }
  const pem = rawKey.replace(/\\n/g, "\n").trim();
  if (!pem.includes("-----BEGIN PRIVATE KEY-----") || !pem.includes("-----END PRIVATE KEY-----")) throw new Error("Firebase private key has invalid PEM markers");
  const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----|\s/g, "")), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name:"RSASSA-PKCS1-v1_5", hash:"SHA-256" }, false, ["sign"]);
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg:"RS256", typ:"JWT" }));
  const claims = b64url(JSON.stringify({ iss:email, sub:email, aud:"https://oauth2.googleapis.com/token", iat:now, exp:now + 3600, scope:scope === "storage" ? "https://www.googleapis.com/auth/devstorage.read_write" : "https://www.googleapis.com/auth/datastore" }));
  const unsigned = `${header}.${claims}`;
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const body = new URLSearchParams({ grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer", assertion:`${unsigned}.${b64url(new Uint8Array(signature))}` });
  const response = await fetch("https://oauth2.googleapis.com/token", { method:"POST", headers:{"content-type":"application/x-www-form-urlencoded"}, body });
  if (!response.ok) throw new Error("Firebase-serveradgang kunne ikke oprettes");
  const data = await response.json() as { access_token:string; expires_in:number };
  cachedTokens.set(scope, { value:data.access_token, expiresAt:Date.now() + data.expires_in * 1000 });
  return data.access_token;
}

export async function verifyFirebaseRequest(request: Request): Promise<FirebaseIdentity> {
  const idToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!idToken) throw new Error("Du skal være logget ind");
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(serverConfig("NEXT_PUBLIC_FIREBASE_API_KEY"))}`, { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({idToken}) });
  if (!response.ok) throw new Error("Din login-session er udløbet");
  const data = await response.json() as { users?: Array<{localId:string;email:string;emailVerified:boolean}> };
  const user = data.users?.[0]; if (!user?.emailVerified) throw new Error("E-mailadressen skal bekræftes først");
  return user;
}

function documentUrl(uid: string) {
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(serverConfig("NEXT_PUBLIC_FIREBASE_PROJECT_ID"))}/databases/(default)/documents/users/${encodeURIComponent(uid)}`;
}

export function firestoreDocumentName(path: string) {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `projects/${encodeURIComponent(serverConfig("NEXT_PUBLIC_FIREBASE_PROJECT_ID"))}/databases/(default)/documents/${encodedPath}`;
}

export function firestoreDocumentUrl(path: string) {
  return `https://firestore.googleapis.com/v1/${firestoreDocumentName(path)}`;
}

export async function getFirestoreDocument(path: string) {
  const response = await fetch(firestoreDocumentUrl(path), { headers:{ authorization:`Bearer ${await serviceToken()}` } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Firestore-dokumentet kunne ikke hentes");
  return response.json() as Promise<{ name:string; fields?:Record<string, FirestoreField>; updateTime?:string }>;
}

export async function commitFirestoreWrites(writes: unknown[]) {
  const project = encodeURIComponent(serverConfig("NEXT_PUBLIC_FIREBASE_PROJECT_ID"));
  const response = await fetch(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents:commit`, {
    method:"POST", headers:{authorization:`Bearer ${await serviceToken()}`,"content-type":"application/json"}, body:JSON.stringify({writes}),
  });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(response.status === 409 || response.status === 412 ? "IDENTITY_CONFLICT" : `Firestore-opdateringen fejlede: ${details}`);
  }
}

export async function getServerProfile(uid: string) {
  const response = await fetch(documentUrl(uid), { headers:{ authorization:`Bearer ${await serviceToken()}` } });
  if (!response.ok) throw new Error("Brugerprofilen kunne ikke hentes");
  const data = await response.json() as { fields?: Record<string, FirestoreField> };
  const fields = data.fields ?? {};
  return {
    name: fields.name?.stringValue ?? "",
    email: fields.email?.stringValue ?? "",
    phone: fields.phone?.stringValue ?? "",
    street: fields.street?.stringValue ?? "",
    place: {
      id: fields.place?.mapValue?.fields?.id?.stringValue ?? "",
      country: fields.place?.mapValue?.fields?.country?.stringValue === "SE" ? "SE" as const : "DK" as const,
      postcode: fields.place?.mapValue?.fields?.postcode?.stringValue ?? "",
      city: fields.place?.mapValue?.fields?.city?.stringValue ?? "",
      lat: fields.place?.mapValue?.fields?.lat?.doubleValue ?? 0,
      lon: fields.place?.mapValue?.fields?.lon?.doubleValue ?? 0,
    },
    country: fields.place?.mapValue?.fields?.country?.stringValue === "SE" ? "SE" as const : "DK" as const,
    stripeCustomerId: fields.stripeCustomerId?.stringValue,
    subscriptionPlan: fields.subscriptionPlan?.stringValue === "plus" ? "plus" as const : "free" as const,
  };
}

export async function updateSubscription(uid: string, values: { customerId?: string; subscriptionId?: string; active: boolean }) {
  const fields: Record<string, FirestoreField> = {
    subscriptionPlan:{stringValue:values.active ? "plus" : "free"},
    subscriptionStatus:{stringValue:values.active ? "active" : "inactive"},
    subscriptionUpdatedAt:{timestampValue:new Date().toISOString()},
  };
  if (values.customerId) fields.stripeCustomerId = {stringValue:values.customerId};
  if (values.subscriptionId) fields.stripeSubscriptionId = {stringValue:values.subscriptionId};
  const masks = Object.keys(fields).map(key=>`updateMask.fieldPaths=${encodeURIComponent(key)}`).join("&");
  const response = await fetch(`${documentUrl(uid)}?${masks}`, { method:"PATCH", headers:{authorization:`Bearer ${await serviceToken()}`,"content-type":"application/json"}, body:JSON.stringify({fields}) });
  if (!response.ok) throw new Error("Abonnementsstatus kunne ikke gemmes");
}
