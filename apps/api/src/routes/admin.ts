import { Hono } from "hono";
import type { Context } from "hono";
import type { Transaction, CorbitsEndpoint } from "@openclawd/shared";

import { getSupabaseClient } from "../lib/supabase.js";
import { InvalidRequestError } from "../lib/errors.js";
import { adminAuthMiddleware } from "../middleware/admin.js";
import { getBalance, getUsageHistory } from "../services/ledger.js";

export const adminRoutes = new Hono();

// Apply admin auth middleware to all routes
adminRoutes.use("/*", adminAuthMiddleware);

/**
 * Helper to parse pagination query parameters
 */
function getPagination(c: Context): { limit: number; offset: number } {
  const limitParam = c.req.query("limit");
  const offsetParam = c.req.query("offset");

  let limit = 50;
  let offset = 0;

  if (limitParam !== undefined) {
    const parsed = parseInt(limitParam, 10);
    if (isNaN(parsed) || parsed <= 0 || parsed > 100) {
      throw new InvalidRequestError("limit must be a positive integer between 1 and 100");
    }
    limit = parsed;
  }

  if (offsetParam !== undefined) {
    const parsed = parseInt(offsetParam, 10);
    if (isNaN(parsed) || parsed < 0) {
      throw new InvalidRequestError("offset must be a non-negative integer");
    }
    offset = parsed;
  }

  return { limit, offset };
}

/**
 * GET /admin/users
 * List all users with their balances.
 * Supports pagination via limit/offset query params.
 */
adminRoutes.get("/users", async (c: Context) => {
  const { limit, offset } = getPagination(c);
  const supabase = getSupabaseClient();

  // Get total count
  const { count, error: countError } = await supabase
    .from("users")
    .select("*", { count: "exact", head: true });

  if (countError) {
    throw new Error(`Failed to count users: ${countError.message}`);
  }

  // Get users with pagination
  const { data: users, error } = await supabase
    .from("users")
    .select("id, email, created_at")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error(`Failed to fetch users: ${error.message}`);
  }

  // Fetch balances for each user
  const usersWithBalances = await Promise.all(
    (users ?? []).map(async (user: { id: string; email: string; created_at: string }) => {
      const balance = await getBalance(user.id);
      return {
        id: user.id,
        email: user.email,
        balance,
        createdAt: new Date(user.created_at),
      };
    })
  );

  return c.json({
    users: usersWithBalances,
    total: count ?? 0,
  });
});

/**
 * GET /admin/users/:userId
 * Get single user details with balance and recent transactions.
 */
adminRoutes.get("/users/:userId", async (c: Context) => {
  const userId = c.req.param("userId");
  const supabase = getSupabaseClient();

  // Get user
  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id, email, created_at")
    .eq("id", userId)
    .single();

  if (userError) {
    if (userError.code === "PGRST116") {
      throw new InvalidRequestError("User not found");
    }
    throw new Error(`Failed to fetch user: ${userError.message}`);
  }

  // Get balance
  const balance = await getBalance(userId);

  // Get recent transactions (last 30 days)
  const { transactions } = await getUsageHistory(userId, 30);

  return c.json({
    user: {
      id: user.id,
      email: user.email,
      balance,
      createdAt: new Date(user.created_at),
    },
    recentTransactions: transactions,
  });
});

/**
 * GET /admin/transactions
 * List all transactions with filtering and pagination.
 * Query params:
 *   - limit, offset: pagination
 *   - userId: filter by user
 *   - endpoint: filter by endpoint (xai, openai, amazon)
 *   - startDate, endDate: filter by date range (ISO 8601)
 */
adminRoutes.get("/transactions", async (c: Context) => {
  const { limit, offset } = getPagination(c);
  const userId = c.req.query("userId");
  const endpoint = c.req.query("endpoint");
  const startDate = c.req.query("startDate");
  const endDate = c.req.query("endDate");

  const supabase = getSupabaseClient();

  // Build query
  let query = supabase.from("transactions").select("*", { count: "exact" });

  if (userId) {
    query = query.eq("user_id", userId);
  }

  if (endpoint) {
    query = query.eq("endpoint", endpoint);
  }

  if (startDate) {
    const date = new Date(startDate);
    if (isNaN(date.getTime())) {
      throw new InvalidRequestError("startDate must be a valid ISO 8601 date");
    }
    query = query.gte("created_at", date.toISOString());
  }

  if (endDate) {
    const date = new Date(endDate);
    if (isNaN(date.getTime())) {
      throw new InvalidRequestError("endDate must be a valid ISO 8601 date");
    }
    query = query.lte("created_at", date.toISOString());
  }

  // Execute with pagination
  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error(`Failed to fetch transactions: ${error.message}`);
  }

  const transactions: Transaction[] = (data ?? []).map((row: {
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
  }) => ({
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
  }));

  return c.json({
    transactions,
    total: count ?? 0,
  });
});

/**
 * GET /admin/metrics
 * Get system-wide metrics including totals and activity breakdowns.
 */
adminRoutes.get("/metrics", async (c: Context) => {
  const supabase = getSupabaseClient();

  // Get total users
  const { count: totalUsers, error: usersError } = await supabase
    .from("users")
    .select("*", { count: "exact", head: true });

  if (usersError) {
    throw new Error(`Failed to count users: ${usersError.message}`);
  }

  // Get total deposits (revenue)
  const { data: deposits, error: depositsError } = await supabase
    .from("credits")
    .select("amount")
    .eq("type", "deposit");

  if (depositsError) {
    throw new Error(`Failed to fetch deposits: ${depositsError.message}`);
  }

  const totalRevenue = (deposits ?? []).reduce(
    (sum: number, entry: { amount: string | number }) => sum + Number(entry.amount),
    0
  );

  // Get transaction totals
  const { data: transactionTotals, error: totalsError } = await supabase
    .from("transactions")
    .select("cost_x402, cost_margin");

  if (totalsError) {
    throw new Error(`Failed to fetch transaction totals: ${totalsError.message}`);
  }

  const totalApiCost = (transactionTotals ?? []).reduce(
    (sum: number, t: { cost_x402: string | number; cost_margin: string | number }) => sum + Number(t.cost_x402),
    0
  );

  const totalMarginEarned = (transactionTotals ?? []).reduce(
    (sum: number, t: { cost_x402: string | number; cost_margin: string | number }) => sum + Number(t.cost_margin),
    0
  );

  // Get transactions by time period
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const { count: transactions24h, error: t24hError } = await supabase
    .from("transactions")
    .select("*", { count: "exact", head: true })
    .gte("created_at", oneDayAgo.toISOString());

  if (t24hError) {
    throw new Error(`Failed to count 24h transactions: ${t24hError.message}`);
  }

  const { count: transactions7d, error: t7dError } = await supabase
    .from("transactions")
    .select("*", { count: "exact", head: true })
    .gte("created_at", sevenDaysAgo.toISOString());

  if (t7dError) {
    throw new Error(`Failed to count 7d transactions: ${t7dError.message}`);
  }

  const { count: transactions30d, error: t30dError } = await supabase
    .from("transactions")
    .select("*", { count: "exact", head: true })
    .gte("created_at", thirtyDaysAgo.toISOString());

  if (t30dError) {
    throw new Error(`Failed to count 30d transactions: ${t30dError.message}`);
  }

  return c.json({
    totalUsers: totalUsers ?? 0,
    totalRevenue,
    totalApiCost,
    totalMarginEarned,
    transactions: {
      last24h: transactions24h ?? 0,
      last7d: transactions7d ?? 0,
      last30d: transactions30d ?? 0,
    },
  });
});

/**
 * Helper to get the current margin percent from environment or default.
 */
function getMarginPercent(): number {
  const marginStr = process.env.MARGIN_PERCENT;
  if (marginStr) {
    const margin = parseFloat(marginStr);
    if (!isNaN(margin) && margin >= 0) {
      return margin;
    }
  }
  return 20; // Default 20% margin
}

/**
 * In-memory settings store for margin percent.
 * In production, this should be stored in the database.
 */
let cachedMarginPercent: number | null = null;

/**
 * GET /admin/settings
 * Get current admin settings.
 */
adminRoutes.get("/settings", async (c: Context) => {
  const supabase = getSupabaseClient();

  // Try to get from admin_settings table first
  const { data, error } = await supabase
    .from("admin_settings")
    .select("key, value")
    .eq("key", "margin_percent")
    .single();

  let marginPercent: number;

  if (error || !data) {
    // Fall back to cached value or environment variable
    marginPercent = cachedMarginPercent ?? getMarginPercent();
  } else {
    marginPercent = Number(data.value);
  }

  return c.json({
    marginPercent,
  });
});

/**
 * PUT /admin/settings
 * Update admin settings.
 * Body: { marginPercent: number }
 */
adminRoutes.put("/settings", async (c: Context) => {
  const body = await c.req.json<{ marginPercent?: number }>();

  if (body.marginPercent === undefined || typeof body.marginPercent !== "number") {
    throw new InvalidRequestError("marginPercent is required and must be a number");
  }

  if (body.marginPercent < 0 || body.marginPercent > 100) {
    throw new InvalidRequestError("marginPercent must be between 0 and 100");
  }

  const supabase = getSupabaseClient();

  // Try to upsert into admin_settings table
  const { error } = await supabase
    .from("admin_settings")
    .upsert(
      {
        key: "margin_percent",
        value: body.marginPercent.toString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );

  if (error) {
    // If table doesn't exist, fall back to in-memory cache
    console.warn("admin_settings table not available, using in-memory cache:", error.message);
    cachedMarginPercent = body.marginPercent;
  }

  return c.json({
    success: true,
    marginPercent: body.marginPercent,
  });
});
