/**
 * Wallet service for Solana x402 payments using @faremeter packages.
 *
 * This service provides:
 * - Wallet initialization from a base58 encoded private key
 * - USDC balance checking
 * - Authenticated x402 requests with automatic payment handling
 */

import { createLocalWallet } from "@faremeter/wallet-solana";
import { wrap } from "@faremeter/fetch";
import { exact as paymentExact } from "@faremeter/payment-solana";
import { Keypair, Connection, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

// USDC mint addresses for Solana clusters
const USDC_MINT = {
  "mainnet-beta": new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
  devnet: new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"),
} as const;

// Default to mainnet-beta
const DEFAULT_RPC_URL = "https://api.mainnet-beta.solana.com";
const DEFAULT_NETWORK = "mainnet-beta" as const;

// Module-level state for singleton wallet
let walletInstance: Awaited<ReturnType<typeof createLocalWallet>> | null = null;
let connectionInstance: Connection | null = null;
let keypairInstance: Keypair | null = null;

/**
 * Result type for x402 requests, includes the response and the cost paid
 */
export interface X402RequestResult<T = unknown> {
  data: T;
  response: Response;
  costPaid: string | null; // Amount paid in USDC atomic units (null if no payment was made)
}

/**
 * Initialize the Solana wallet from the SOLANA_PRIVATE_KEY environment variable.
 * The key should be base58 encoded.
 *
 * This function is idempotent - subsequent calls will return the same wallet instance.
 *
 * @throws Error if SOLANA_PRIVATE_KEY is not set or is invalid
 */
export async function initWallet(): Promise<
  Awaited<ReturnType<typeof createLocalWallet>>
> {
  if (walletInstance) {
    return walletInstance;
  }

  const privateKeyBase58 = process.env["SOLANA_PRIVATE_KEY"];
  if (!privateKeyBase58) {
    throw new Error(
      "SOLANA_PRIVATE_KEY environment variable is not set. Please provide a base58 encoded Solana private key."
    );
  }

  const rpcUrl = process.env["RPC_URL"] ?? DEFAULT_RPC_URL;

  // Decode base58 private key to Uint8Array
  let secretKey: Uint8Array;
  try {
    secretKey = bs58.decode(privateKeyBase58);
  } catch (error) {
    throw new Error(
      `Invalid SOLANA_PRIVATE_KEY: Failed to decode base58. ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // Create Keypair from secret key
  try {
    keypairInstance = Keypair.fromSecretKey(secretKey);
  } catch (error) {
    throw new Error(
      `Invalid SOLANA_PRIVATE_KEY: Failed to create keypair. ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // Create Connection to Solana RPC
  connectionInstance = new Connection(rpcUrl, "confirmed");

  // Create wallet using @faremeter/wallet-solana
  walletInstance = await createLocalWallet(DEFAULT_NETWORK, keypairInstance);

  console.log(
    `Wallet initialized: ${walletInstance.publicKey.toBase58()} on ${DEFAULT_NETWORK}`
  );

  return walletInstance;
}

/**
 * Get the USDC balance of the initialized wallet.
 *
 * @returns The USDC balance as a string in human-readable format (e.g., "10.50")
 * @throws Error if wallet is not initialized or balance fetch fails
 */
export async function getWalletBalance(): Promise<{
  amount: string;
  decimals: number;
  rawAmount: bigint;
}> {
  if (!walletInstance || !connectionInstance || !keypairInstance) {
    throw new Error("Wallet not initialized. Call initWallet() first.");
  }

  const mint = USDC_MINT[DEFAULT_NETWORK];

  // Get the associated token account for USDC
  const { getAssociatedTokenAddressSync } = await import("@solana/spl-token");
  const tokenAccount = getAssociatedTokenAddressSync(
    mint,
    walletInstance.publicKey
  );

  try {
    const balance =
      await connectionInstance.getTokenAccountBalance(tokenAccount);

    const rawAmount = BigInt(balance.value.amount);
    const decimals = balance.value.decimals;
    const amount = balance.value.uiAmountString ?? "0";

    return {
      amount,
      decimals,
      rawAmount,
    };
  } catch (error) {
    // Check if the token account doesn't exist (balance is 0)
    if (
      error instanceof Error &&
      error.message.includes("could not find account")
    ) {
      return {
        amount: "0",
        decimals: 6,
        rawAmount: BigInt(0),
      };
    }
    throw new Error(
      `Failed to fetch USDC balance: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Make an authenticated x402 request to a given endpoint.
 * This function handles the complete x402 payment flow automatically:
 * 1. Makes the initial request
 * 2. If 402 Payment Required is received, executes payment via wallet
 * 3. Retries the request with payment proof
 *
 * @param endpoint - The base URL of the API (e.g., "https://api.corbits.ai")
 * @param path - The path to request (e.g., "/v1/chat/completions")
 * @param body - The request body (will be JSON stringified)
 * @param method - HTTP method (defaults to POST)
 * @returns The response data and the cost paid to the endpoint
 */
export async function makeX402Request<T = unknown>(
  endpoint: string,
  path: string,
  body?: unknown,
  method: "GET" | "POST" | "PUT" | "DELETE" = "POST"
): Promise<X402RequestResult<T>> {
  if (!walletInstance || !connectionInstance) {
    throw new Error("Wallet not initialized. Call initWallet() first.");
  }

  const mint = USDC_MINT[DEFAULT_NETWORK];

  // Create payment handler for Solana USDC payments
  const paymentHandler = paymentExact.createPaymentHandler(
    walletInstance,
    mint,
    connectionInstance
  );

  // Create the x402-aware fetch wrapper
  const x402Fetch = wrap(fetch, {
    handlers: [paymentHandler],
    retryCount: 3,
    initialRetryDelay: 1000,
  });

  const url = new URL(path, endpoint).toString();

  // Track payment information from headers
  let costPaid: string | null = null;

  const requestInit: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
    },
  };

  if (body !== undefined && method !== "GET") {
    requestInit.body = JSON.stringify(body);
  }

  const response = await x402Fetch(url, requestInit);

  // Extract payment information from response headers if available
  const paymentHeader = response.headers.get("X-Payment-Response");
  if (paymentHeader) {
    try {
      const paymentInfo = JSON.parse(paymentHeader) as {
        amount?: string;
        settled?: boolean;
      };
      if (paymentInfo.amount) {
        costPaid = paymentInfo.amount;
      }
    } catch {
      // Payment header parsing failed, continue without cost info
    }
  }

  // Also check for the standard x402 payment amount header
  const paidAmount = response.headers.get("X-Payment-Amount");
  if (paidAmount) {
    costPaid = paidAmount;
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `x402 request failed with status ${response.status}: ${errorText}`
    );
  }

  const data = (await response.json()) as T;

  return {
    data,
    response,
    costPaid,
  };
}

/**
 * Get the public key of the initialized wallet.
 *
 * @returns The wallet's public key as a base58 string
 * @throws Error if wallet is not initialized
 */
export function getWalletPublicKey(): string {
  if (!walletInstance) {
    throw new Error("Wallet not initialized. Call initWallet() first.");
  }
  return walletInstance.publicKey.toBase58();
}

/**
 * Check if the wallet has been initialized.
 */
export function isWalletInitialized(): boolean {
  return walletInstance !== null;
}
