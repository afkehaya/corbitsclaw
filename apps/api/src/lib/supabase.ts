import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function getEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function createSupabaseClient() {
  const supabaseUrl = getEnvVar("SUPABASE_URL");
  const supabaseAnonKey = getEnvVar("SUPABASE_ANON_KEY");

  return createClient(supabaseUrl, supabaseAnonKey);
}

// Lazy-initialized default client
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let defaultClient: SupabaseClient<any, "public", any> | null = null;

export function getSupabaseClient() {
  if (!defaultClient) {
    defaultClient = createSupabaseClient();
  }
  return defaultClient;
}
