import { getSupabaseClient } from "../lib/supabase.js";
import type { CreditEntry, Transaction, CorbitsEndpoint } from "@openclawd/shared";

/**
 * Get the current balance for a user by summing all credit entries.
 * @param userId - The user's UUID
 * @returns The user's current balance in USD
 */
export async function getBalance(userId: string): Promise<number> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("credits")
    .select("amount")
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Failed to fetch balance: ${error.message}`);
  }

  // Sum all amounts (deposits are positive, usage is negative)
  const balance = (data ?? []).reduce((sum: number, entry: { amount: string | number }) => {
    return sum + Number(entry.amount);
  }, 0);

  return balance;
}

/**
 * Record a deposit (positive credit entry) for a user.
 * @param userId - The user's UUID
 * @param amount - The deposit amount in USD (must be positive)
 * @param stripeSessionId - The Stripe checkout session ID
 * @returns The created credit entry
 */
export async function recordDeposit(
  userId: string,
  amount: number,
  stripeSessionId: string
): Promise<CreditEntry> {
  if (amount <= 0) {
    throw new Error("Deposit amount must be positive");
  }

  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("credits")
    .insert({
      user_id: userId,
      amount: amount,
      type: "deposit",
      description: "Credit deposit via Stripe",
      stripe_session_id: stripeSessionId,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to record deposit: ${error.message}`);
  }

  return mapCreditEntry(data);
}

/**
 * Record usage (negative credit entry) for a user.
 * @param userId - The user's UUID
 * @param amount - The usage amount in USD (must be positive, will be stored as negative)
 * @param requestId - The associated request ID
 * @param description - Optional description of the usage
 * @returns The created credit entry
 */
export async function recordUsage(
  userId: string,
  amount: number,
  requestId: string,
  description?: string
): Promise<CreditEntry> {
  if (amount <= 0) {
    throw new Error("Usage amount must be positive");
  }

  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("credits")
    .insert({
      user_id: userId,
      amount: -amount, // Store as negative for usage
      type: "usage",
      description: description ?? "API usage",
      request_id: requestId,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to record usage: ${error.message}`);
  }

  return mapCreditEntry(data);
}

/**
 * Get usage history for a user from the transactions table.
 * @param userId - The user's UUID
 * @param days - Number of days to look back (default: 30)
 * @returns Array of transactions within the specified period
 */
export async function getUsageHistory(
  userId: string,
  days: number = 30
): Promise<{ transactions: Transaction[]; total: number; period: { start: Date; end: Date } }> {
  const supabase = getSupabaseClient();

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .gte("created_at", startDate.toISOString())
    .lte("created_at", endDate.toISOString())
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch usage history: ${error.message}`);
  }

  const transactions = (data ?? []).map(mapTransaction);
  const total = transactions.reduce((sum: number, t: Transaction) => sum + t.costTotal, 0);

  return {
    transactions,
    total,
    period: { start: startDate, end: endDate },
  };
}

/**
 * Check if user has sufficient balance for a given amount.
 * @param userId - The user's UUID
 * @param amount - The amount to check against
 * @returns True if user has sufficient balance
 */
export async function hasSufficientBalance(
  userId: string,
  amount: number
): Promise<boolean> {
  const balance = await getBalance(userId);
  return balance >= amount;
}

/**
 * Input for recording a transaction.
 */
export interface RecordTransactionInput {
  userId: string;
  requestId: string;
  endpoint: CorbitsEndpoint;
  path: string;
  costX402: number;
  costMargin: number;
  costTotal: number;
  marginPercent: number;
  responseStatus?: number;
  responseTimeMs?: number;
}

/**
 * Record a transaction with full cost breakdown.
 * This is used for detailed tracking and analytics.
 * @param input - Transaction details
 * @returns The created transaction
 */
export async function recordTransaction(
  input: RecordTransactionInput
): Promise<Transaction> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("transactions")
    .insert({
      user_id: input.userId,
      request_id: input.requestId,
      endpoint: input.endpoint,
      path: input.path,
      cost_x402: input.costX402,
      cost_margin: input.costMargin,
      cost_total: input.costTotal,
      margin_percent: input.marginPercent,
      response_status: input.responseStatus ?? null,
      response_time_ms: input.responseTimeMs ?? null,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to record transaction: ${error.message}`);
  }

  return mapTransaction(data);
}

// Helper function to map database row to CreditEntry type
function mapCreditEntry(row: {
  id: string;
  user_id: string;
  amount: string | number;
  type: string;
  description: string | null;
  stripe_session_id: string | null;
  request_id: string | null;
  created_at: string;
}): CreditEntry {
  return {
    id: row.id,
    userId: row.user_id,
    amount: Number(row.amount),
    type: row.type as "deposit" | "usage" | "refund",
    description: row.description ?? undefined,
    stripeSessionId: row.stripe_session_id ?? undefined,
    requestId: row.request_id ?? undefined,
    createdAt: new Date(row.created_at),
  };
}

// Helper function to map database row to Transaction type
function mapTransaction(row: {
  id: string;
  user_id: string;
  request_id: string;
  endpoint: string;
  path: string;
  cost_x402: string | number;
  cost_margin: string | number;
  cost_total: string | number;
  margin_percent: string | number;
  response_status: number | null;
  response_time_ms: number | null;
  created_at: string;
}): Transaction {
  return {
    id: row.id,
    userId: row.user_id,
    requestId: row.request_id,
    endpoint: row.endpoint as CorbitsEndpoint,
    path: row.path,
    costX402: Number(row.cost_x402),
    costMargin: Number(row.cost_margin),
    costTotal: Number(row.cost_total),
    marginPercent: Number(row.margin_percent),
    responseStatus: row.response_status ?? undefined,
    responseTimeMs: row.response_time_ms ?? undefined,
    createdAt: new Date(row.created_at),
  };
}
