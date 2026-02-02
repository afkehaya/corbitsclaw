// User
export type User = {
  id: string;
  email: string;
  apiKey: string;
  createdAt: Date;
};

// Credit entry
export type CreditEntry = {
  id: string;
  userId: string;
  amount: number;
  type: 'deposit' | 'usage' | 'refund';
  description?: string | undefined;
  stripeSessionId?: string | undefined;
  requestId?: string | undefined;
  createdAt: Date;
};

// Transaction with cost breakdown
export type Transaction = {
  id: string;
  userId: string;
  requestId: string;
  endpoint: CorbitsEndpoint;
  path: string;
  costX402: number; // What Corbits charged us
  costMargin: number; // Our margin
  costTotal: number; // What we charged user
  marginPercent: number; // Margin % at time of transaction
  responseStatus?: number | undefined;
  responseTimeMs?: number | undefined;
  createdAt: Date;
};

// API Responses
export type BalanceResponse = {
  balance: number;
  currency: 'USD';
};

export type UsageResponse = {
  transactions: Transaction[];
  total: number;
  period: { start: Date; end: Date };
};

// Corbits Endpoints
export type CorbitsEndpoint = 'xai' | 'openai' | 'amazon';

// Admin config types
export type MarginConfig = {
  global: number;
  perEndpoint: Partial<Record<CorbitsEndpoint, number>>;
};

export type AdminConfig = {
  margin: MarginConfig;
  walletAlertThreshold: number;
};
