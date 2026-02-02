import { Hono } from "hono";
import type { Context } from "hono";

import { InvalidRequestError } from "../lib/errors.js";
import { authMiddleware, getAuthUser } from "../middleware/auth.js";
import {
  createCheckoutSession,
  handleWebhook,
  getCheckoutSession,
} from "../services/stripe.js";

export const stripeRoutes = new Hono();

/**
 * POST /stripe/checkout
 * Creates a Stripe Checkout session for purchasing credits.
 * Requires authentication via Bearer token.
 *
 * Body:
 *   - amount: number (10, 25, 50, or 100)
 *   - returnUrl: string (URL to redirect after checkout)
 */
stripeRoutes.post("/checkout", authMiddleware, async (c: Context) => {
  const user = getAuthUser(c);
  const body = await c.req.json<{ amount?: number; returnUrl?: string }>();

  const { amount, returnUrl } = body;

  if (typeof amount !== "number" || amount <= 0) {
    throw new InvalidRequestError("amount must be a positive number");
  }

  if (!returnUrl || typeof returnUrl !== "string") {
    throw new InvalidRequestError("returnUrl is required");
  }

  // Validate returnUrl is a valid URL
  try {
    new URL(returnUrl);
  } catch {
    throw new InvalidRequestError("returnUrl must be a valid URL");
  }

  const { sessionId, url } = await createCheckoutSession(user.id, amount, returnUrl);

  return c.json({
    success: true,
    sessionId,
    url,
  });
});

/**
 * GET /stripe/session/:id
 * Retrieves the status of a checkout session.
 * Requires authentication via Bearer token.
 */
stripeRoutes.get("/session/:id", authMiddleware, async (c: Context) => {
  const sessionId = c.req.param("id");

  if (!sessionId) {
    throw new InvalidRequestError("Session ID is required");
  }

  const session = await getCheckoutSession(sessionId);

  return c.json({
    success: true,
    session,
  });
});

/**
 * POST /stripe/webhook
 * Handles Stripe webhook events.
 * No authentication required - uses Stripe signature verification.
 * IMPORTANT: This endpoint must receive the raw body, not parsed JSON.
 */
stripeRoutes.post("/webhook", async (c: Context) => {
  const signature = c.req.header("stripe-signature");

  if (!signature) {
    throw new InvalidRequestError("Missing stripe-signature header");
  }

  // Get the raw body for signature verification
  const body = await c.req.text();

  const result = await handleWebhook(body, signature);

  return c.json(result);
});
