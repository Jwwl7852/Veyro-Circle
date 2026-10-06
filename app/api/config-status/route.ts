import { serverConfigStatus } from "@/lib/server-config";
import { serviceToken } from "@/lib/firebase-server";

export async function GET() {
  const missing=serverConfigStatus();
  const firebaseMissing=missing.filter(name=>name.includes("FIREBASE"));
  let firebaseServerReady=false;
  let firebaseError:string|undefined;
  if (!firebaseMissing.length) {
    try { await serviceToken(); firebaseServerReady=true; }
    catch (cause) {
      const message=cause instanceof Error ? cause.message : "Ukendt Firebase-serverfejl";
      firebaseError=message.includes("key") || message.includes("Data") || message.includes("ASN") ? "Den private Firebase-nøgle har et ugyldigt format." : "Firebase kunne ikke godkende servicekontoen.";
    }
  }
  return Response.json({ready:missing.length===0 && firebaseServerReady,missing,firebaseServerReady,...(firebaseError?{firebaseError}:{})});
}
