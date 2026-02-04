// User
export interface User {
  id: string;
  email: string;
  apiKey: string;
  createdAt: Date;
}

// Credit entry
export interface CreditEntry {
  id: string;
  userId: string;
  amount: number;
  type: 'deposit' | 'usage' | 'refund';
  description?: string | undefined;
  stripeSessionId?: string | undefined;
  requestId?: string | undefined;
  createdAt: Date;
}

// Transaction with cost breakdown
export interface Transaction {
  id: string;
  userId: string;
  requestId: string;
  endpoint: string;
  path: string;
  costX402: number; // What Corbits charged us
  costMargin: number; // Our margin
  costTotal: number; // What we charged user
  marginPercent: number; // Margin % at time of transaction
  responseStatus?: number | undefined;
  responseTimeMs?: number | undefined;
  createdAt: Date;
}

// API Responses
export interface BalanceResponse {
  balance: number;
  currency: 'USD';
}

// Usage response
export interface UsageResponse {
  transactions: Transaction[];
  total: number;
  period: { start: Date; end: Date };
}

// Admin config types
export interface MarginConfig {
  global: number;
  perEndpoint: Record<string, number>;
}

export interface AdminConfig {
  margin: MarginConfig;
  walletAlertThreshold: number;
}
