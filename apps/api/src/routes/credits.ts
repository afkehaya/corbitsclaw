import { Hono } from "hono";
import type { Context } from "hono";
import type { BalanceResponse, UsageResponse } from "@openclawd/shared";
import { getBalance, getUsageHistory } from "../services/ledger.js";
import { AuthError, InvalidRequestError } from "../lib/errors.js";

export const creditsRoutes = new Hono();

/**
 * GET /balance
 * Returns the user's current balance in USD.
 * Requires authentication via X-User-Id header (to be replaced with proper auth middleware).
 */
creditsRoutes.get("/balance", async (c: Context) => {
  const userId = c.req.header("X-User-Id");

  if (!userId) {
    throw new AuthError("Missing X-User-Id header");
  }

  const balance = await getBalance(userId);

  const response: BalanceResponse = {
    balance,
    currency: "USD",
  };

  return c.json(response);
});

/**
 * GET /usage
 * Returns the user's usage history.
 * Query params:
 *   - days: number of days to look back (default: 30)
 * Requires authentication via X-User-Id header (to be replaced with proper auth middleware).
 */
creditsRoutes.get("/usage", async (c: Context) => {
  const userId = c.req.header("X-User-Id");

  if (!userId) {
    throw new AuthError("Missing X-User-Id header");
  }

  const daysParam = c.req.query("days");
  let days = 30;

  if (daysParam !== undefined) {
    const parsed = parseInt(daysParam, 10);
    if (isNaN(parsed) || parsed <= 0) {
      throw new InvalidRequestError("days must be a positive integer");
    }
    days = parsed;
  }

  const { transactions, total, period } = await getUsageHistory(userId, days);

  const response: UsageResponse = {
    transactions,
    total,
    period,
  };

  return c.json(response);
});
