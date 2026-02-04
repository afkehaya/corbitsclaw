import { Hono } from 'hono';
import type { Context } from 'hono';
import type { BalanceResponse, UsageResponse } from '@corbitsclaw/shared';
import { getBalance, getUsageHistory } from '../services/ledger.js';
import { InvalidRequestError } from '../lib/errors.js';
import { authMiddleware, getAuthUser } from '../middleware/auth.js';

export const creditsRoutes = new Hono();

// Apply auth middleware to all credits routes
creditsRoutes.use('/*', authMiddleware);

/**
 * GET /balance
 * Returns the user's current balance in USD.
 */
creditsRoutes.get('/balance', async (c: Context) => {
  const user = getAuthUser(c);
  const balance = await getBalance(user.id);

  const response: BalanceResponse = {
    balance,
    currency: 'USD',
  };

  return c.json(response);
});

/**
 * GET /usage
 * Returns the user's usage history.
 * Query params:
 *   - days: number of days to look back (default: 30)
 */
creditsRoutes.get('/usage', async (c: Context) => {
  const user = getAuthUser(c);

  const daysParam = c.req.query('days');
  let days = 30;

  if (daysParam !== undefined) {
    const parsed = parseInt(daysParam, 10);
    if (isNaN(parsed) || parsed <= 0) {
      throw new InvalidRequestError('days must be a positive integer');
    }
    days = parsed;
  }

  const { transactions, total, period } = await getUsageHistory(user.id, days);

  const response: UsageResponse = {
    transactions,
    total,
    period,
  };

  return c.json(response);
});
