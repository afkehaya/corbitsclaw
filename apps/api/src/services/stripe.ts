import Stripe from "stripe";

import { getSupabaseClient } from "../lib/supabase.js";
import { InvalidRequestError } from "../lib/errors.js";
import { recordDeposit } from "./ledger.js";

/**
 * Gets a required environment variable, throwing if not set.
 */
function getEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Gets margin percentage from environment or default.
 */
function getMarginPercent(): number {
  const marginStr = process.env.MARGIN_PERCENT;
  if (marginStr) {
    const margin = parseFloat(marginStr);
    if (!isNaN(margin) && margin >= 0) {
      return margin;
    }
  }
  return 30; // Default 30% margin
}

// Lazy-initialized Stripe client
let stripeClient: Stripe | null = null;

/**
 * Gets or creates the Stripe client.
 */
function getStripeClient(): Stripe {
  if (!stripeClient) {
    const secretKey = getEnvVar("STRIPE_SECRET_KEY");
    stripeClient = new Stripe(secretKey, {
      apiVersion: "2023-10-16",
    });
  }
  return stripeClient;
}

/**
 * Allowed purchase amounts in USD.
 */
const ALLOWED_AMOUNTS = [10, 25, 50, 100];

/**
 * Creates a Stripe Checkout session for purchasing credits.
 * @param userId - The user's UUID
 * @param amountUsd - The amount in USD to purchase (10, 25, 50, or 100)
 * @param returnUrl - The URL to redirect to after checkout
 * @returns The checkout session URL
 */
export async function createCheckoutSession(
  userId: string,
  amountUsd: number,
  returnUrl: string
): Promise<{ sessionId: string; url: string }> {
  if (!ALLOWED_AMOUNTS.includes(amountUsd)) {
    throw new InvalidRequestError(
      `Invalid amount. Allowed amounts: ${ALLOWED_AMOUNTS.join(", ")}`
    );
  }

  const stripe = getStripeClient();
  const marginPercent = getMarginPercent();

  // Apply margin to the price (user pays more, gets the base amount in credits)
  const priceWithMargin = Math.round(amountUsd * (1 + marginPercent / 100) * 100); // in cents

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `OpenClawd Credits - $${amountUsd}`,
            description: `Purchase $${amountUsd} in API credits`,
          },
          unit_amount: priceWithMargin,
        },
        quantity: 1,
      },
    ],
    metadata: {
      userId,
      creditAmount: amountUsd.toString(),
    },
    success_url: `${returnUrl}?session_id={CHECKOUT_SESSION_ID}&status=success`,
    cancel_url: `${returnUrl}?status=cancelled`,
  });

  if (!session.url) {
    throw new Error("Failed to create checkout session URL");
  }

  return {
    sessionId: session.id,
    url: session.url,
  };
}

/**
 * Handles a Stripe webhook event.
 * @param body - The raw request body
 * @param signature - The Stripe signature header
 */
export async function handleWebhook(
  body: string | Buffer,
  signature: string
): Promise<{ received: boolean; processed: boolean; message?: string }> {
  const stripe = getStripeClient();
  const webhookSecret = getEnvVar("STRIPE_WEBHOOK_SECRET");

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    throw new InvalidRequestError(`Webhook signature verification failed: ${message}`);
  }

  // Handle the checkout.session.completed event
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    return await processCompletedCheckout(session);
  }

  // Acknowledge other events but don't process them
  return { received: true, processed: false, message: `Unhandled event type: ${event.type}` };
}

/**
 * Processes a completed checkout session.
 * @param session - The Stripe checkout session
 */
async function processCompletedCheckout(
  session: Stripe.Checkout.Session
): Promise<{ received: boolean; processed: boolean; message?: string }> {
  const userId = session.metadata?.userId;
  const creditAmountStr = session.metadata?.creditAmount;

  if (!userId || !creditAmountStr) {
    console.error("Missing metadata in checkout session:", session.id);
    return { received: true, processed: false, message: "Missing metadata" };
  }

  const creditAmount = parseFloat(creditAmountStr);
  if (isNaN(creditAmount) || creditAmount <= 0) {
    console.error("Invalid credit amount in checkout session:", session.id);
    return { received: true, processed: false, message: "Invalid credit amount" };
  }

  // Check for idempotency - ensure we haven't already processed this session
  const supabase = getSupabaseClient();
  const { data: existingEntry, error: lookupError } = await supabase
    .from("credits")
    .select("id")
    .eq("stripe_session_id", session.id)
    .single();

  if (lookupError && lookupError.code !== "PGRST116") {
    // PGRST116 = not found, which is expected
    console.error("Error checking for existing deposit:", lookupError);
    throw new Error(`Failed to check for existing deposit: ${lookupError.message}`);
  }

  if (existingEntry) {
    // Already processed - idempotency check passed
    return { received: true, processed: false, message: "Already processed" };
  }

  // Record the deposit
  await recordDeposit(userId, creditAmount, session.id);

  console.log(`Processed deposit: ${creditAmount} credits for user ${userId}, session ${session.id}`);

  return { received: true, processed: true };
}

/**
 * Retrieves a checkout session by ID.
 * @param sessionId - The Stripe checkout session ID
 * @returns The checkout session with payment status
 */
export async function getCheckoutSession(sessionId: string): Promise<{
  id: string;
  status: string;
  paymentStatus: string;
  creditAmount: number | null;
  amountTotal: number | null;
}> {
  const stripe = getStripeClient();

  const session = await stripe.checkout.sessions.retrieve(sessionId);

  return {
    id: session.id,
    status: session.status ?? "unknown",
    paymentStatus: session.payment_status,
    creditAmount: session.metadata?.creditAmount
      ? parseFloat(session.metadata.creditAmount)
      : null,
    amountTotal: session.amount_total, // in cents
  };
}
