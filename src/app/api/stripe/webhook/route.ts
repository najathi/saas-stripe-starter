import { NextResponse } from "next/server";
import { db } from "@/db";
import { env } from "@/env";
import { processStripeWebhook } from "@/lib/billing/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe webhook endpoint. Configure in the Stripe Dashboard (or `stripe listen`)
 * with the events listed in HANDLED_EVENTS (src/lib/billing/webhook.ts).
 */
export async function POST(request: Request) {
  // The raw body is required for signature verification — do not JSON.parse first.
  const payload = await request.text();
  try {
    const result = await processStripeWebhook({
      db,
      payload,
      signature: request.headers.get("stripe-signature"),
      secret: env.stripeWebhookSecret,
    });
    if (result.status >= 400) console.warn("[stripe] webhook rejected:", result.body.error);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    // 500 makes Stripe retry; the transaction rolled back so the retry is safe.
    console.error("[stripe] webhook handler failed", error);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
