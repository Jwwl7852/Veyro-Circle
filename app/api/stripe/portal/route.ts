import { verifyFirebaseRequest, getServerProfile } from "@/lib/firebase-server";
import { stripeRequest } from "@/lib/stripe-server";

export async function POST(request: Request) {
  try {
    const user = await verifyFirebaseRequest(request); const profile = await getServerProfile(user.localId);
    if (!profile.stripeCustomerId) throw new Error("Der findes endnu intet Stripe-abonnement på kontoen");
    const session = await stripeRequest("/billing_portal/sessions", new URLSearchParams({customer:profile.stripeCustomerId,return_url:new URL(request.url).origin+"/?billing=return"}));
    return Response.json({url:session.url});
  } catch (error) { return Response.json({error:error instanceof Error ? error.message : "Kundeportalen kunne ikke åbnes"},{status:400}); }
}
