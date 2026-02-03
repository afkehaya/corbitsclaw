import * as crypto from 'node:crypto';

import bcrypt from 'bcrypt';

import { getSupabaseClient } from '../lib/supabase.js';
import { AuthError } from '../lib/errors.js';
import { sendMagicLink } from './email.js';

const MAGIC_LINK_EXPIRY_MINUTES = 15;
const API_KEY_PREFIX = 'oc_';
const API_KEY_RANDOM_LENGTH = 32; // Random part length (hex chars)
const API_KEY_VISIBLE_PREFIX_LENGTH = 8; // Visible portion after oc_ for identification
const BCRYPT_ROUNDS = 10;

/**
 * User type from database
 */
export interface User {
  id: string;
  email: string;
  api_key_hash: string; // bcrypt hash of the full API key
  api_key_prefix: string; // Visible prefix for identification (e.g., oc_abc12345...)
  created_at: string;
  updated_at: string;
}

/**
 * Magic link type from database
 */
interface MagicLink {
  id: string;
  email: string;
  token: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

/**
 * Generates a secure random token for magic links.
 */
function generateToken(): string {
  return crypto.randomUUID() + crypto.randomUUID();
}

/**
 * Result of generating an API key, containing both the full key
 * (shown to user once) and the data to store in the database.
 */
export interface GeneratedApiKey {
  /** Full API key to show to user (only shown once) */
  fullKey: string;
  /** bcrypt hash of the full key (stored in database) */
  hash: string;
  /** Visible prefix for identification (stored in database) */
  visiblePrefix: string;
}

/**
 * Generates an API key in the format oc_XXXXXXXXXXXX.
 * Returns both the full key (shown to user once) and the hash/prefix for storage.
 */
export async function generateApiKey(): Promise<GeneratedApiKey> {
  // Generate random string
  const randomPart = crypto
    .randomUUID()
    .replace(/-/g, '')
    .concat(crypto.randomUUID().replace(/-/g, ''))
    .slice(0, API_KEY_RANDOM_LENGTH);

  const fullKey = `${API_KEY_PREFIX}${randomPart}`;

  // Create visible prefix for identification (e.g., "oc_abc12345...")
  const visiblePrefix = `${API_KEY_PREFIX}${randomPart.slice(0, API_KEY_VISIBLE_PREFIX_LENGTH)}...`;

  // Hash the full key for secure storage
  const hash = await bcrypt.hash(fullKey, BCRYPT_ROUNDS);

  return { fullKey, hash, visiblePrefix };
}

/**
 * Generates an API key synchronously (for backward compatibility in tests).
 * @deprecated Use generateApiKey() instead for production code.
 */
export function generateApiKeySync(): string {
  const randomPart = crypto
    .randomUUID()
    .replace(/-/g, '')
    .concat(crypto.randomUUID().replace(/-/g, ''))
    .slice(0, API_KEY_RANDOM_LENGTH);
  return `${API_KEY_PREFIX}${randomPart}`;
}

/**
 * Creates a magic link for the given email and sends it.
 * @param email - The user's email address
 */
export async function generateMagicLink(email: string): Promise<void> {
  const supabase = getSupabaseClient();
  const token = generateToken();
  const expiresAt = new Date(
    Date.now() + MAGIC_LINK_EXPIRY_MINUTES * 60 * 1000
  );

  // Store the magic link in the database
  const { error } = await supabase.from('magic_links').insert({
    email: email.toLowerCase().trim(),
    token,
    expires_at: expiresAt.toISOString(),
  });

  if (error) {
    throw new Error(`Failed to create magic link: ${error.message}`);
  }

  // Send the email
  await sendMagicLink(email, token);
}

/**
 * Result of verifying a magic link.
 * For new users, apiKey contains the full key (shown once).
 * For existing users, apiKey is null (they should use their previously-provided key).
 */
export interface VerifyMagicLinkResult {
  /** Full API key for new users, null for existing users */
  apiKey: string | null;
  /** Visible prefix for identification (e.g., "oc_abc12345...") */
  apiKeyPrefix: string;
  /** User's email address */
  email: string;
  /** Whether this is a newly created user */
  isNewUser: boolean;
}

/**
 * Verifies a magic link token and returns or creates a user with their API key.
 * @param token - The magic link token
 * @returns The user's API key (for new users) or prefix (for existing users)
 */
export async function verifyMagicLink(
  token: string
): Promise<VerifyMagicLinkResult> {
  const supabase = getSupabaseClient();

  // Find the magic link
  const { data: magicLink, error: findError } = await supabase
    .from('magic_links')
    .select('*')
    .eq('token', token)
    .single<MagicLink>();

  if (findError) {
    throw new AuthError('Invalid or expired magic link');
  }

  // Check if already used
  if (magicLink.used_at) {
    throw new AuthError('Magic link has already been used');
  }

  // Check if expired
  if (new Date(magicLink.expires_at) < new Date()) {
    throw new AuthError('Magic link has expired');
  }

  // Mark the magic link as used
  const { error: updateError } = await supabase
    .from('magic_links')
    .update({ used_at: new Date().toISOString() })
    .eq('id', magicLink.id);

  if (updateError) {
    throw new Error(`Failed to update magic link: ${updateError.message}`);
  }

  const email = magicLink.email;

  // Check if user exists
  const { data: existingUser, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .single<User>();

  if (userError && userError.code !== 'PGRST116') {
    // PGRST116 = not found
    throw new Error(`Failed to lookup user: ${userError.message}`);
  }

  if (existingUser) {
    // For existing users, we cannot return the API key since we only store the hash.
    // Return null to indicate they should use their previously-provided key.
    // The visible prefix helps them identify their key.
    return {
      apiKey: null,
      apiKeyPrefix: existingUser.api_key_prefix,
      email,
      isNewUser: false,
    };
  }

  // Create new user with hashed API key
  const { fullKey, hash, visiblePrefix } = await generateApiKey();
  const { error: createError } = await supabase.from('users').insert({
    email,
    api_key_hash: hash,
    api_key_prefix: visiblePrefix,
  });

  if (createError) {
    throw new Error(`Failed to create user: ${createError.message}`);
  }

  // Return the full key - this is the ONLY time the user will see it
  return {
    apiKey: fullKey,
    apiKeyPrefix: visiblePrefix,
    email,
    isNewUser: true,
  };
}

/**
 * Extracts the visible prefix from a full API key.
 * Used to look up potential matching users before bcrypt verification.
 */
function extractVisiblePrefix(apiKey: string): string {
  const randomPart = apiKey.slice(API_KEY_PREFIX.length);
  return `${API_KEY_PREFIX}${randomPart.slice(0, API_KEY_VISIBLE_PREFIX_LENGTH)}...`;
}

/**
 * Validates an API key and returns the associated user.
 * Uses the key's prefix for initial lookup, then verifies with bcrypt.
 * @param apiKey - The API key to validate
 * @returns The user if valid, null otherwise
 */
export async function validateApiKey(apiKey: string): Promise<User | null> {
  if (!apiKey.startsWith(API_KEY_PREFIX)) {
    return null;
  }

  // Extract the visible prefix to narrow down potential matches
  const visiblePrefix = extractVisiblePrefix(apiKey);

  const supabase = getSupabaseClient();

  // Find users with matching prefix (should typically be unique, but handle collisions)
  const { data: users, error } = await supabase
    .from('users')
    .select('*')
    .eq('api_key_prefix', visiblePrefix);

  if (error || users.length === 0) {
    return null;
  }

  // Verify the API key against each potential match's hash
  for (const user of users as User[]) {
    const isValid = await bcrypt.compare(apiKey, user.api_key_hash);
    if (isValid) {
      return user;
    }
  }

  return null;
}

/**
 * Result of refreshing an API key.
 */
export interface RefreshApiKeyResult {
  /** Full API key to show to user (only shown once) */
  apiKey: string;
  /** Visible prefix for identification */
  apiKeyPrefix: string;
}

/**
 * Generates a new API key for an existing user.
 * The old API key is invalidated.
 * @param userId - The user's ID
 * @returns The new API key (shown once) and its visible prefix
 */
export async function refreshApiKey(
  userId: string
): Promise<RefreshApiKeyResult> {
  const supabase = getSupabaseClient();
  const { fullKey, hash, visiblePrefix } = await generateApiKey();

  const { error } = await supabase
    .from('users')
    .update({
      api_key_hash: hash,
      api_key_prefix: visiblePrefix,
    })
    .eq('id', userId);

  if (error) {
    throw new Error(`Failed to refresh API key: ${error.message}`);
  }

  return { apiKey: fullKey, apiKeyPrefix: visiblePrefix };
}
