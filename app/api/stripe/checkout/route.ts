import { verifyFirebaseRequest, getServerProfile } from "@/lib/firebase-server";
import { serverConfig } from "@/lib/server-config";
import { stripeRequest } from "@/lib/stripe-server";

export async function POST(request: Request) {
  try {
    const user = await verifyFirebaseRequest(request);
    const profile = await getServerProfile(user.localId);
    if (profile.subscriptionPlan === "plus") throw new Error("Du har allerede Circle Plus");
    const origin = new URL(request.url).origin;
    const body = new URLSearchParams({
      mode:"subscription", "line_items[0][price]":serverConfig(profile.country === "SE" ? "STRIPE_PRICE_SEK" : "STRIPE_PRICE_DKK"), "line_items[0][quantity]":"1",
      success_url:`${origin}/?checkout=success`, cancel_url:`${origin}/?checkout=cancelled`,
      "metadata[uid]":user.localId, "subscription_data[metadata][uid]":user.localId, allow_promotion_codes:"true",
    });
    body.set(profile.stripeCustomerId ? "customer" : "customer_email", profile.stripeCustomerId || user.email);
    const session = await stripeRequest("/checkout/sessions", body);
    return Response.json({url:session.url});
  } catch (error) { return Response.json({error:error instanceof Error ? error.message : "Betalingen kunne ikke startes"},{status:400}); }
}
