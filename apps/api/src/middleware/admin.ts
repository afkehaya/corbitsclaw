import type { Context, Next } from "hono";

import { ForbiddenError } from "../lib/errors.js";

/**
 * Gets the admin API key from environment variables.
 * Throws an error if not configured.
 */
function getAdminApiKey(): string {
  const key = process.env.ADMIN_API_KEY;
  if (!key) {
    throw new Error("ADMIN_API_KEY environment variable is not configured");
  }
  return key;
}

/**
 * Admin authentication middleware.
 * Validates the X-Admin-Key header against the ADMIN_API_KEY environment variable.
 * Returns 403 Forbidden if the key is missing or invalid.
 */
export async function adminAuthMiddleware(c: Context, next: Next): Promise<Response | void> {
  const adminKey = c.req.header("X-Admin-Key");

  if (!adminKey) {
    throw new ForbiddenError("Missing X-Admin-Key header");
  }

  const expectedKey = getAdminApiKey();

  if (adminKey !== expectedKey) {
    throw new ForbiddenError("Invalid admin API key");
  }

  await next();
}
