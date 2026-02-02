import { Hono } from "hono";
import type { Context } from "hono";

import { InvalidRequestError } from "../lib/errors.js";
import { generateMagicLink, verifyMagicLink, refreshApiKey } from "../services/auth.js";
import { authMiddleware, getAuthUser } from "../middleware/auth.js";

export const authRoutes = new Hono();

/**
 * POST /auth/send-link
 * Accepts an email address and sends a magic link.
 */
authRoutes.post("/send-link", async (c: Context) => {
  const body = await c.req.json<{ email?: string }>();
  const email = body.email;

  if (!email || typeof email !== "string") {
    throw new InvalidRequestError("Email is required");
  }

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new InvalidRequestError("Invalid email format");
  }

  await generateMagicLink(email);

  return c.json({
    success: true,
    message: "Magic link sent to your email",
  });
});

/**
 * GET /auth/verify?token=XXX
 * Verifies a magic link token and returns the API key.
 */
authRoutes.get("/verify", async (c: Context) => {
  const token = c.req.query("token");

  if (!token) {
    throw new InvalidRequestError("Token is required");
  }

  const result = await verifyMagicLink(token);

  return c.json({
    success: true,
    api_key: result.apiKey,
    email: result.email,
    is_new_user: result.isNewUser,
  });
});

/**
 * POST /auth/refresh
 * Generates a new API key for the authenticated user.
 * Requires authentication via Bearer token.
 */
authRoutes.post("/refresh", authMiddleware, async (c: Context) => {
  const user = getAuthUser(c);
  const newApiKey = await refreshApiKey(user.id);

  return c.json({
    success: true,
    api_key: newApiKey,
    message: "API key refreshed. Your previous key is now invalid.",
  });
});
