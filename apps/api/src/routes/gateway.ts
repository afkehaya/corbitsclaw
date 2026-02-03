/**
 * Payment gateway routes that proxy requests to Corbits endpoints.
 *
 * These routes handle the complete payment flow:
 * 1. Authenticate user via API key
 * 2. Check user balance
 * 3. Proxy request to Corbits endpoint via x402
 * 4. Record usage with margin
 * 5. Return response to user
 */

import * as crypto from 'node:crypto';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { CORBITS_URLS } from '@openclawd/shared';
import type { CorbitsEndpoint } from '@openclawd/shared';

import { authMiddleware, getAuthUser } from '../middleware/auth.js';
import {
  hasSufficientBalance,
  recordUsage,
  recordTransaction,
} from '../services/ledger.js';
import {
  initWallet,
  makeX402Request,
  isWalletInitialized,
  X402CostMissingError,
} from '../services/wallet.js';
import { InsufficientBalanceError } from '../lib/errors.js';
import { getMarginPercentSync } from '../services/config.js';

// Minimum balance threshold for requests (in USD)
const MIN_BALANCE_THRESHOLD = 0.01;

// USDC decimals (6)
const USDC_DECIMALS = 6;

/**
 * Convert USDC atomic units to USD decimal.
 * @param atomicUnits - Amount in USDC atomic units (6 decimals)
 * @returns Amount in USD as a number
 */
function atomicToUsd(atomicUnits: string): number {
  const amount = BigInt(atomicUnits);
  // Convert from 6 decimal places to USD
  return Number(amount) / Math.pow(10, USDC_DECIMALS);
}

/**
 * Generate a unique request ID for tracking.
 */
function generateRequestId(): string {
  return `req_${crypto.randomUUID().replace(/-/g, '')}`;
}

export const gatewayRoutes = new Hono();

// Apply auth middleware to all gateway routes
gatewayRoutes.use('/*', authMiddleware);

/**
 * Generic handler for proxying requests to a Corbits endpoint.
 */
async function handleGatewayRequest(
  c: Context,
  endpoint: CorbitsEndpoint,
  path: string
): Promise<Response> {
  const requestId = generateRequestId();
  const startTime = Date.now();
  const timings: Record<string, number> = {};

  console.log(`[${requestId}] Gateway request started: ${endpoint} ${path}`);

  const user = getAuthUser(c);
  timings.getUser = Date.now() - startTime;
  console.log(`[${requestId}] Got user ${user.id} in ${timings.getUser}ms`);

  // Check user balance
  const balanceStart = Date.now();
  const hasBalance = await hasSufficientBalance(user.id, MIN_BALANCE_THRESHOLD);
  timings.balanceCheck = Date.now() - balanceStart;
  console.log(
    `[${requestId}] Balance check: ${hasBalance} in ${timings.balanceCheck}ms`
  );

  if (!hasBalance) {
    throw new InsufficientBalanceError(
      `Insufficient balance. Minimum ${MIN_BALANCE_THRESHOLD} USD required.`
    );
  }

  // Initialize wallet if not already done
  const walletStart = Date.now();
  if (!isWalletInitialized()) {
    console.log(`[${requestId}] Initializing wallet...`);
    await initWallet();
  }
  timings.walletInit = Date.now() - walletStart;
  console.log(`[${requestId}] Wallet ready in ${timings.walletInit}ms`);

  // Get the request body
  const bodyStart = Date.now();
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    // No body or invalid JSON - proceed without body
    body = undefined;
  }
  timings.parseBody = Date.now() - bodyStart;
  console.log(`[${requestId}] Body parsed in ${timings.parseBody}ms`);

  // Get the Corbits endpoint URL
  // Corbits handles the routing internally, so we just POST to /
  const baseUrl = CORBITS_URLS[endpoint];

  console.log(`[${requestId}] Proxying to ${baseUrl} (path: ${path})`);

  // Make the x402 request
  let responseStatus: number | undefined;
  let costX402 = 0;
  let data: unknown;

  try {
    const result = await makeX402Request(baseUrl, '/', body, 'POST');
    data = result.data;
    responseStatus = result.response.status;
    costX402 = atomicToUsd(result.costPaid);

    console.log(`[${requestId}] Request successful, cost: ${costX402} USDC`);
  } catch (error) {
    const responseTimeMs = Date.now() - startTime;
    console.error(`[${requestId}] Corbits request failed:`, error);

    // Handle missing x402 cost headers as a critical security error
    // This prevents free usage when payment headers are missing or malformed
    if (error instanceof X402CostMissingError) {
      console.error(
        `[${requestId}] CRITICAL: x402 cost headers missing - blocking request to prevent untracked usage`
      );
      try {
        await recordTransaction({
          userId: user.id,
          requestId,
          endpoint,
          path: path,
          costX402: 0,
          costMargin: 0,
          costTotal: 0,
          marginPercent: getMarginPercentSync(),
          responseStatus: 500,
          responseTimeMs,
        });
      } catch (recordError) {
        console.error(
          `[${requestId}] Failed to record failed transaction:`,
          recordError
        );
      }
      return c.json(
        {
          error: 'Payment verification failed',
          message:
            'Unable to verify payment cost from upstream service. Request blocked to prevent untracked usage.',
          requestId,
        },
        500
      );
    }

    // Record the failed transaction for monitoring
    try {
      await recordTransaction({
        userId: user.id,
        requestId,
        endpoint,
        path: path,
        costX402: 0,
        costMargin: 0,
        costTotal: 0,
        marginPercent: getMarginPercentSync(),
        responseStatus: 502,
        responseTimeMs,
      });
    } catch (recordError) {
      console.error(
        `[${requestId}] Failed to record failed transaction:`,
        recordError
      );
    }

    // Return 502 for Corbits endpoint errors
    return c.json(
      {
        error: 'Gateway error',
        message:
          error instanceof Error
            ? error.message
            : 'Request to upstream service failed',
        requestId,
      },
      502
    );
  }

  const responseTimeMs = Date.now() - startTime;

  // Calculate costs with margin
  const marginPercent = getMarginPercentSync();
  const costMargin = costX402 * (marginPercent / 100);
  const costTotal = costX402 + costMargin;

  console.log(
    `[${requestId}] Cost breakdown: x402=${costX402}, margin=${costMargin} (${marginPercent}%), total=${costTotal}`
  );

  // Record usage and transaction
  try {
    // Record in credits table (deducts from balance)
    if (costTotal > 0) {
      await recordUsage(
        user.id,
        costTotal,
        requestId,
        `${endpoint.toUpperCase()} API: ${path}`
      );
    }

    // Record detailed transaction
    await recordTransaction({
      userId: user.id,
      requestId,
      endpoint,
      path: path,
      costX402,
      costMargin,
      costTotal,
      marginPercent,
      responseStatus,
      responseTimeMs,
    });

    console.log(`[${requestId}] Usage recorded: ${costTotal} USD`);
  } catch (error) {
    console.error(`[${requestId}] Failed to record usage:`, error);
    // CRITICAL: Fail the request if usage recording fails.
    // The x402 payment has already been made, but we cannot proceed without
    // tracking the cost. This ensures we don't allow untracked usage.
    // TODO: Implement a reconciliation queue to recover failed usage recordings.
    // This would allow us to retry recording later and potentially refund the
    // user if the upstream service confirms the payment was received but we
    // couldn't record it.
    return c.json(
      {
        error: 'Internal server error',
        message:
          'Failed to record usage. Please contact support with your request ID.',
        requestId,
      },
      500
    );
  }

  // Return the response with request ID header
  // Use Response directly to avoid Hono's strict JSON typing with unknown data
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'X-Request-Id': requestId,
      'X-Cost-Total': costTotal.toFixed(6),
    },
  });
}

/**
 * POST /gateway/xai/*
 * Proxy requests to xAI/Grok endpoint.
 */
gatewayRoutes.post('/xai/*', async (c: Context) => {
  // Extract path after /xai/
  const path = c.req.path.replace(/^\/gateway\/xai/, '');
  return handleGatewayRequest(c, 'xai', path);
});

/**
 * POST /gateway/openai/*
 * Proxy requests to OpenAI endpoint.
 */
gatewayRoutes.post('/openai/*', async (c: Context) => {
  // Extract path after /openai/
  const path = c.req.path.replace(/^\/gateway\/openai/, '');
  return handleGatewayRequest(c, 'openai', path);
});

/**
 * POST /gateway/amazon/*
 * Proxy requests to Amazon/Crossmint endpoint.
 */
gatewayRoutes.post('/amazon/*', async (c: Context) => {
  // Extract path after /amazon/
  const path = c.req.path.replace(/^\/gateway\/amazon/, '');
  return handleGatewayRequest(c, 'amazon', path);
});
