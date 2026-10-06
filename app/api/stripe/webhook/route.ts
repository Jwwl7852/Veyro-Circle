import { updateSubscription } from "@/lib/firebase-server";
import { verifyStripeWebhook } from "@/lib/stripe-server";

export async function POST(request: Request) {
  try {
    const raw = await request.text(); const event = await verifyStripeWebhook(raw, request.headers.get("stripe-signature")); const object = event.data.object;
    if (event.type === "checkout.session.completed") {
      const uid = (object.metadata as {uid?:string}|undefined)?.uid;
      if (uid) await updateSubscription(uid,{customerId:String(object.customer||""),subscriptionId:String(object.subscription||""),active:true});
    }
    if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      const uid = (object.metadata as {uid?:string}|undefined)?.uid;
      const active = event.type !== "customer.subscription.deleted" && ["active","trialing"].includes(String(object.status));
      if (uid) await updateSubscription(uid,{customerId:String(object.customer||""),subscriptionId:String(object.id||""),active});
    }
    return Response.json({received:true});
  } catch (error) { return Response.json({error:error instanceof Error ? error.message : "Webhook blev afvist"},{status:400}); }
}
