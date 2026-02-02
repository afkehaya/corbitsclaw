import * as crypto from "node:crypto";

import { getSupabaseClient } from "../lib/supabase.js";
import { AuthError } from "../lib/errors.js";
import { sendMagicLink } from "./email.js";

const MAGIC_LINK_EXPIRY_MINUTES = 15;
const API_KEY_PREFIX = "oc_";
const API_KEY_LENGTH = 24; // Total length including prefix

/**
 * User type from database
 */
export interface User {
  id: string;
  email: string;
  api_key: string;
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
 * Generates an API key in the format oc_XXXXXXXXXXXX (24 chars total).
 */
export function generateApiKey(): string {
  // Generate random string of required length (minus prefix length)
  const randomLength = API_KEY_LENGTH - API_KEY_PREFIX.length;
  const randomPart = crypto.randomUUID().replace(/-/g, "").slice(0, randomLength);
  return `${API_KEY_PREFIX}${randomPart}`;
}

/**
 * Creates a magic link for the given email and sends it.
 * @param email - The user's email address
 */
export async function generateMagicLink(email: string): Promise<void> {
  const supabase = getSupabaseClient();
  const token = generateToken();
  const expiresAt = new Date(Date.now() + MAGIC_LINK_EXPIRY_MINUTES * 60 * 1000);

  // Store the magic link in the database
  const { error } = await supabase.from("magic_links").insert({
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
 * Verifies a magic link token and returns or creates a user with their API key.
 * @param token - The magic link token
 * @returns The user's API key
 */
export async function verifyMagicLink(token: string): Promise<{ apiKey: string; email: string; isNewUser: boolean }> {
  const supabase = getSupabaseClient();

  // Find the magic link
  const { data: magicLink, error: findError } = await supabase
    .from("magic_links")
    .select("*")
    .eq("token", token)
    .single<MagicLink>();

  if (findError || !magicLink) {
    throw new AuthError("Invalid or expired magic link");
  }

  // Check if already used
  if (magicLink.used_at) {
    throw new AuthError("Magic link has already been used");
  }

  // Check if expired
  if (new Date(magicLink.expires_at) < new Date()) {
    throw new AuthError("Magic link has expired");
  }

  // Mark the magic link as used
  const { error: updateError } = await supabase
    .from("magic_links")
    .update({ used_at: new Date().toISOString() })
    .eq("id", magicLink.id);

  if (updateError) {
    throw new Error(`Failed to update magic link: ${updateError.message}`);
  }

  const email = magicLink.email;

  // Check if user exists
  const { data: existingUser, error: userError } = await supabase
    .from("users")
    .select("*")
    .eq("email", email)
    .single<User>();

  if (userError && userError.code !== "PGRST116") {
    // PGRST116 = not found
    throw new Error(`Failed to lookup user: ${userError.message}`);
  }

  if (existingUser) {
    return { apiKey: existingUser.api_key, email, isNewUser: false };
  }

  // Create new user
  const apiKey = generateApiKey();
  const { error: createError } = await supabase.from("users").insert({
    email,
    api_key: apiKey,
  });

  if (createError) {
    throw new Error(`Failed to create user: ${createError.message}`);
  }

  return { apiKey, email, isNewUser: true };
}

/**
 * Validates an API key and returns the associated user.
 * @param apiKey - The API key to validate
 * @returns The user if valid, null otherwise
 */
export async function validateApiKey(apiKey: string): Promise<User | null> {
  if (!apiKey || !apiKey.startsWith(API_KEY_PREFIX)) {
    return null;
  }

  const supabase = getSupabaseClient();
  const { data: user, error } = await supabase
    .from("users")
    .select("*")
    .eq("api_key", apiKey)
    .single<User>();

  if (error || !user) {
    return null;
  }

  return user;
}

/**
 * Generates a new API key for an existing user.
 * @param userId - The user's ID
 * @returns The new API key
 */
export async function refreshApiKey(userId: string): Promise<string> {
  const supabase = getSupabaseClient();
  const newApiKey = generateApiKey();

  const { error } = await supabase
    .from("users")
    .update({ api_key: newApiKey })
    .eq("id", userId);

  if (error) {
    throw new Error(`Failed to refresh API key: ${error.message}`);
  }

  return newApiKey;
}
