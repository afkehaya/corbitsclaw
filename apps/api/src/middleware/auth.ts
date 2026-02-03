import type { Context, Next } from 'hono';

import { AuthError } from '../lib/errors.js';
import { validateApiKey, type User } from '../services/auth.js';

/**
 * Extended Hono context with user attached
 */
export interface AuthContext extends Context {
  user: User;
}

/**
 * Extracts the Bearer token from the Authorization header.
 * @param authHeader - The Authorization header value
 * @returns The token if valid, null otherwise
 */
function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0]?.toLowerCase() !== 'bearer') {
    return null;
  }

  return parts[1] ?? null;
}

/**
 * Authentication middleware that validates Bearer tokens.
 * Attaches the user to the Hono context if valid.
 * Returns 401 if authentication fails.
 */
export async function authMiddleware(c: Context, next: Next): Promise<void> {
  const authHeader = c.req.header('Authorization');
  const token = extractBearerToken(authHeader);

  if (!token) {
    throw new AuthError('Missing or invalid Authorization header');
  }

  const user = await validateApiKey(token);
  if (!user) {
    throw new AuthError('Invalid API key');
  }

  // Attach user to context
  c.set('user', user);

  await next();
}

/**
 * Helper to get the authenticated user from context.
 * Should only be used in routes protected by authMiddleware.
 */
export function getAuthUser(c: Context): User {
  const user = c.get('user') as User | undefined;
  if (!user) {
    throw new AuthError('User not found in context');
  }
  return user;
}
