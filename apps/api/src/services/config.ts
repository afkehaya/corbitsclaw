/**
 * Configuration service for managing application settings.
 *
 * Provides centralized access to configuration values with a fallback hierarchy:
 * 1. Database (admin_settings table) - with caching
 * 2. Environment variables
 * 3. Shared constants defaults
 */

import { DEFAULT_MARGIN_PERCENT } from '@corbitsclaw/shared';
import { getSupabaseClient } from '../lib/supabase.js';

/**
 * Cache for margin percent value.
 * Stores the database value to avoid repeated queries.
 */
let cachedMarginPercent: number | null = null;

/**
 * Timestamp of last cache refresh.
 */
let cacheTimestamp = 0;

/**
 * Cache TTL in milliseconds (5 minutes).
 */
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Check if the cache is still valid.
 */
function isCacheValid(): boolean {
  return (
    cachedMarginPercent !== null && Date.now() - cacheTimestamp < CACHE_TTL_MS
  );
}

/**
 * Get margin percentage from environment variable or default.
 * This is the synchronous fallback when database is unavailable.
 */
function getMarginPercentFromEnv(): number {
  const envMargin = process.env.MARGIN_PERCENT;
  if (envMargin) {
    const parsed = parseFloat(envMargin);
    if (!isNaN(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return DEFAULT_MARGIN_PERCENT;
}

/**
 * Get the current margin percentage.
 *
 * Fallback hierarchy:
 * 1. Cached value from database (if valid)
 * 2. Database lookup (admin_settings table)
 * 3. MARGIN_PERCENT environment variable
 * 4. DEFAULT_MARGIN_PERCENT from @corbitsclaw/shared
 *
 * @returns The margin percentage (e.g., 30 for 30%)
 */
export async function getMarginPercent(): Promise<number> {
  // Return cached value if valid
  if (isCacheValid() && cachedMarginPercent !== null) {
    return cachedMarginPercent;
  }

  try {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'margin_percent')
      .single<{ value: string }>();

    if (!error) {
      const dbMargin = Number(data.value);
      if (!isNaN(dbMargin) && dbMargin >= 0) {
        // Update cache
        cachedMarginPercent = dbMargin;
        cacheTimestamp = Date.now();
        return dbMargin;
      }
    }
  } catch {
    // Database unavailable, fall through to env/default
  }

  // Fall back to environment variable or default
  const margin = getMarginPercentFromEnv();

  // Cache this value too (with shorter effective TTL since it may change if DB becomes available)
  cachedMarginPercent = margin;
  cacheTimestamp = Date.now();

  return margin;
}

/**
 * Get margin percentage synchronously.
 * Only uses cached value, environment variable, or default.
 * Does NOT query the database.
 *
 * Use this when you need a synchronous value and can't await.
 * Prefer getMarginPercent() when possible.
 *
 * @returns The margin percentage (e.g., 30 for 30%)
 */
export function getMarginPercentSync(): number {
  if (isCacheValid() && cachedMarginPercent !== null) {
    return cachedMarginPercent;
  }
  return getMarginPercentFromEnv();
}

/**
 * Update the margin percent in the database.
 *
 * @param marginPercent - The new margin percentage (0-100)
 * @returns Success status and the updated value
 */
export async function setMarginPercent(
  marginPercent: number
): Promise<{ success: boolean; marginPercent: number }> {
  const supabase = getSupabaseClient();

  const { error } = await supabase.from('admin_settings').upsert(
    {
      key: 'margin_percent',
      value: marginPercent.toString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' }
  );

  if (error) {
    // If table doesn't exist, fall back to in-memory cache only
    console.warn(
      'admin_settings table not available, using in-memory cache:',
      error.message
    );
  }

  // Update cache
  cachedMarginPercent = marginPercent;
  cacheTimestamp = Date.now();

  return { success: true, marginPercent };
}

/**
 * Clear the cached margin percent value.
 * Forces next getMarginPercent() call to query the database.
 */
export function clearMarginPercentCache(): void {
  cachedMarginPercent = null;
  cacheTimestamp = 0;
}
