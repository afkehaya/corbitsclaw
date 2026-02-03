import { Hono } from 'hono';
import type { Context } from 'hono';

import { InvalidRequestError } from '../lib/errors.js';
import {
  generateMagicLink,
  verifyMagicLink,
  refreshApiKey,
} from '../services/auth.js';
import { authMiddleware, getAuthUser } from '../middleware/auth.js';

export const authRoutes = new Hono();

/**
 * POST /auth/send-link
 * Accepts an email address and sends a magic link.
 */
authRoutes.post('/send-link', async (c: Context) => {
  const body = await c.req.json<{ email?: string }>();
  const email = body.email;

  if (!email || typeof email !== 'string') {
    throw new InvalidRequestError('Email is required');
  }

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new InvalidRequestError('Invalid email format');
  }

  await generateMagicLink(email);

  return c.json({
    success: true,
    message: 'Magic link sent to your email',
  });
});

/**
 * GET /auth/verify?token=XXX
 * Verifies a magic link token and returns the API key.
 * For new users, returns the full API key (shown only once).
 * For existing users, returns the visible prefix (they should use their saved key).
 */
authRoutes.get('/verify', async (c: Context) => {
  const token = c.req.query('token');

  if (!token) {
    throw new InvalidRequestError('Token is required');
  }

  const result = await verifyMagicLink(token);

  return c.json({
    success: true,
    // For new users, api_key contains the full key (only time it's shown).
    // For existing users, api_key is null - they should use their previously saved key.
    api_key: result.apiKey,
    api_key_prefix: result.apiKeyPrefix,
    email: result.email,
    is_new_user: result.isNewUser,
    // Message to help users understand the security model
    message: result.isNewUser
      ? 'Save your API key securely - it will not be shown again.'
      : 'Use your previously saved API key. The prefix shown helps identify it.',
  });
});

/**
 * POST /auth/refresh
 * Generates a new API key for the authenticated user.
 * Requires authentication via Bearer token.
 * Returns the new API key (shown only once).
 */
authRoutes.post('/refresh', authMiddleware, async (c: Context) => {
  const user = getAuthUser(c);
  const result = await refreshApiKey(user.id);

  return c.json({
    success: true,
    api_key: result.apiKey,
    api_key_prefix: result.apiKeyPrefix,
    message:
      'API key refreshed. Save it securely - it will not be shown again. Your previous key is now invalid.',
  });
});
