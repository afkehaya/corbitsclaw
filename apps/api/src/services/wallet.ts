/**
 * Wallet service for Solana x402 payments using @faremeter/rides.
 *
 * Provides wallet initialization and authenticated x402 requests
 * with automatic payment handling via the payer API.
 */

import { payer } from '@faremeter/rides';

const BASE58_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Decode a base58-encoded string to a Uint8Array. */
function decodeBase58(input: string): Uint8Array {
  const result: number[] = [];
  for (const char of input) {
    let carry = BASE58_ALPHABET.indexOf(char);
    if (carry < 0) throw new Error(`Invalid base58 character: ${char}`);
    for (let i = 0; i < result.length; i++) {
      carry += (result[i] ?? 0) * 58;
      result[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      result.push(carry & 0xff);
      carry >>= 8;
    }
  }
  // Preserve leading zeros
  for (const char of input) {
    if (char !== '1') break;
    result.push(0);
  }
  return new Uint8Array(result.reverse());
}

/** Result type for x402 requests, includes the response and the cost paid. */
export interface X402RequestResult<T = unknown> {
  data: T;
  response: Response;
  costPaid: string;
}

/** Options for x402 requests. */
export interface X402RequestOptions {
  /**
   * If true, allow responses that have no cost information.
   * By default, missing cost headers will throw an error to prevent free usage.
   */
  allowZeroCost?: boolean;
}

/** Error thrown when x402 cost information cannot be determined from the response. */
export class X402CostMissingError extends Error {
  constructor(url: string) {
    super(
      `x402 cost information missing from response for ${url}. ` +
        `Expected X-Payment-Response or X-Payment-Amount header. ` +
        `This may indicate a malformed response or payment bypass attempt.`
    );
    this.name = 'X402CostMissingError';
  }
}

let initialized = false;

/** Initialize the Solana wallet from the SOLANA_PRIVATE_KEY env var. Idempotent. */
export async function initWallet(): Promise<void> {
  if (initialized) return;
  const key = process.env.SOLANA_PRIVATE_KEY;
  if (!key)
    throw new Error('SOLANA_PRIVATE_KEY environment variable is not set');
  // Decode base58 private key to bytes for @faremeter/rides
  const keyBytes = decodeBase58(key);
  await payer.addLocalWallet(keyBytes);
  initialized = true;
  console.log('Wallet initialized via @faremeter/rides');
}

/** Check if the wallet has been initialized. */
export function isWalletInitialized(): boolean {
  return initialized;
}

/** Make an authenticated x402 request to a given endpoint. */
export async function makeX402Request<T = unknown>(
  endpoint: string,
  path: string,
  body?: unknown,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'POST',
  options: X402RequestOptions = {}
): Promise<X402RequestResult<T>> {
  if (!initialized)
    throw new Error('Wallet not initialized. Call initWallet() first.');

  const url = new URL(path, endpoint).toString();
  const requestInit: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined && method !== 'GET') {
    requestInit.body = JSON.stringify(body);
  }

  const response = await payer.fetch(url, requestInit);

  // Extract cost from x402 headers
  let costPaid: string | null = null;
  const paymentHeader = response.headers.get('X-Payment-Response');
  if (paymentHeader) {
    try {
      const info = JSON.parse(paymentHeader) as { amount?: string };
      if (info.amount) costPaid = info.amount;
    } catch {
      /* ignore parse errors */
    }
  }
  const paidAmount = response.headers.get('X-Payment-Amount');
  if (paidAmount) costPaid = paidAmount;

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `x402 request failed with status ${response.status}: ${errorText}`
    );
  }

  if (costPaid === null) {
    if (!options.allowZeroCost) throw new X402CostMissingError(url);
    costPaid = '0';
  }

  const data = (await response.json()) as T;
  return { data, response, costPaid };
}
