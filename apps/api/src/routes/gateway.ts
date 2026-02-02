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

import * as crypto from "node:crypto";
import { Hono } from "hono";
import type { Context } from "hono";
import { CORBITS_URLS, DEFAULT_MARGIN_PERCENT } from "@openclawd/shared";
import type { CorbitsEndpoint } from "@openclawd/shared";

import { authMiddleware, getAuthUser } from "../middleware/auth.js";
import { hasSufficientBalance, recordUsage } from "../services/ledger.js";
import { recordTransaction } from "../services/ledger.js";
import { initWallet, makeX402Request, isWalletInitialized } from "../services/wallet.js";
import { InsufficientBalanceError } from "../lib/errors.js";

// Minimum balance threshold for requests (in USD)
const MIN_BALANCE_THRESHOLD = 0.01;

// USDC decimals (6)
const USDC_DECIMALS = 6;

/**
 * Get margin percentage from environment or use default.
 */
function getMarginPercent(): number {
  const envMargin = process.env["MARGIN_PERCENT"];
  if (envMargin) {
    const parsed = parseFloat(envMargin);
    if (!isNaN(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return DEFAULT_MARGIN_PERCENT;
}

/**
 * Convert USDC atomic units to USD decimal.
 * @param atomicUnits - Amount in USDC atomic units (6 decimals)
 * @returns Amount in USD as a number
 */
function atomicToUsd(atomicUnits: string | null): number {
  if (!atomicUnits) {
    return 0;
  }
  const amount = BigInt(atomicUnits);
  // Convert from 6 decimal places to USD
  return Number(amount) / Math.pow(10, USDC_DECIMALS);
}

/**
 * Generate a unique request ID for tracking.
 */
function generateRequestId(): string {
  return `req_${crypto.randomUUID().replace(/-/g, "")}`;
}

export const gatewayRoutes = new Hono();

// Apply auth middleware to all gateway routes
gatewayRoutes.use("/*", authMiddleware);

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
  const user = getAuthUser(c);

  console.log(`[${requestId}] Gateway request: ${endpoint} ${path} by user ${user.id}`);

  // Check user balance
  const hasBalance = await hasSufficientBalance(user.id, MIN_BALANCE_THRESHOLD);
  if (!hasBalance) {
    console.log(`[${requestId}] Insufficient balance for user ${user.id}`);
    throw new InsufficientBalanceError(
      `Insufficient balance. Minimum ${MIN_BALANCE_THRESHOLD} USD required.`
    );
  }

  // Initialize wallet if not already done
  if (!isWalletInitialized()) {
    console.log(`[${requestId}] Initializing wallet...`);
    await initWallet();
  }

  // Get the request body
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    // No body or invalid JSON - proceed without body
    body = undefined;
  }

  // Get the Corbits endpoint URL
  const baseUrl = CORBITS_URLS[endpoint];
  const fullPath = path.startsWith("/") ? path : `/${path}`;

  console.log(`[${requestId}] Proxying to ${baseUrl}${fullPath}`);

  // Make the x402 request
  let responseStatus: number | undefined;
  let costX402 = 0;
  let data: unknown;

  try {
    const result = await makeX402Request(baseUrl, fullPath, body, "POST");
    data = result.data;
    responseStatus = result.response.status;
    costX402 = atomicToUsd(result.costPaid);

    console.log(`[${requestId}] Request successful, cost: ${costX402} USDC`);
  } catch (error) {
    const responseTimeMs = Date.now() - startTime;
    console.error(`[${requestId}] Corbits request failed:`, error);

    // Record the failed transaction for monitoring
    try {
      await recordTransaction({
        userId: user.id,
        requestId,
        endpoint,
        path: fullPath,
        costX402: 0,
        costMargin: 0,
        costTotal: 0,
        marginPercent: getMarginPercent(),
        responseStatus: 502,
        responseTimeMs,
      });
    } catch (recordError) {
      console.error(`[${requestId}] Failed to record failed transaction:`, recordError);
    }

    // Return 502 for Corbits endpoint errors
    return c.json(
      {
        error: "Gateway error",
        message: error instanceof Error ? error.message : "Request to upstream service failed",
        requestId,
      },
      502
    );
  }

  const responseTimeMs = Date.now() - startTime;

  // Calculate costs with margin
  const marginPercent = getMarginPercent();
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
        `${endpoint.toUpperCase()} API: ${fullPath}`
      );
    }

    // Record detailed transaction
    await recordTransaction({
      userId: user.id,
      requestId,
      endpoint,
      path: fullPath,
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
    // Don't fail the request if usage recording fails
    // The user already got charged by x402, we just missed recording it
  }

  // Return the response with request ID header
  // Use Response directly to avoid Hono's strict JSON typing with unknown data
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "X-Request-Id": requestId,
      "X-Cost-Total": costTotal.toFixed(6),
    },
  });
}

/**
 * POST /gateway/xai/*
 * Proxy requests to xAI/Grok endpoint.
 */
gatewayRoutes.post("/xai/*", async (c: Context) => {
  // Extract path after /xai/
  const path = c.req.path.replace(/^\/gateway\/xai/, "");
  return handleGatewayRequest(c, "xai", path);
});

/**
 * POST /gateway/openai/*
 * Proxy requests to OpenAI endpoint.
 */
gatewayRoutes.post("/openai/*", async (c: Context) => {
  // Extract path after /openai/
  const path = c.req.path.replace(/^\/gateway\/openai/, "");
  return handleGatewayRequest(c, "openai", path);
});

/**
 * POST /gateway/amazon/*
 * Proxy requests to Amazon/Crossmint endpoint.
 */
gatewayRoutes.post("/amazon/*", async (c: Context) => {
  // Extract path after /amazon/
  const path = c.req.path.replace(/^\/gateway\/amazon/, "");
  return handleGatewayRequest(c, "amazon", path);
});
