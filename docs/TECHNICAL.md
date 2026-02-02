# Technical Specification

## OpenClawd - Agentic Commerce Skill for Claude Code

---

## Tech Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| **Skill Runtime** | Claude Code Skill (Markdown + TypeScript) | Native integration, embedded docs |
| **Backend Framework** | Hono on Vercel Edge | Fast, TypeScript-native, @faremeter compatible |
| **Database** | Supabase (PostgreSQL) | Managed, real-time, good free tier |
| **Auth** | Magic Link (custom) | Passwordless, simple UX |
| **Payments** | Stripe Checkout | PCI compliant, webhooks |
| **Blockchain** | Solana (USDC) | Low fees, @faremeter/wallet-solana |
| **x402 Protocol** | @faremeter/* packages | Required per conventions |
| **Package Manager** | pnpm 10.12.1+ | Catalog versioning per faremeter |
| **Build** | TypeScript + Makefile | Strict mode, faremeter conventions |
| **Testing** | tap (node-tap) | Faremeter standard |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Claude Code Terminal                          │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  OpenClawd Skill (.claude/skills/openclawd/)              │  │
│  │                                                           │  │
│  │  skill.md ──────────────────────────────────────────────┐ │  │
│  │  │ Commands: setup, balance, topup, usage, call         │ │  │
│  │  │ Embedded endpoint docs (xai.md, openai.md, etc.)     │ │  │
│  │  └──────────────────────────────────────────────────────┘ │  │
│  │                                                           │  │
│  │  ~/.openclawd/config.json                                 │  │
│  │  { "apiKey": "oc_...", "email": "user@..." }             │  │
│  └───────────────────────────────────────────────────────────┘  │
└──────────────────────────────┬──────────────────────────────────┘
                               │ HTTPS
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                    API Server (Vercel Edge)                       │
│                    apps/api/ - Hono Framework                     │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                      Routes (src/routes/)                   │  │
│  │                                                             │  │
│  │  auth.ts           credits.ts        gateway.ts   admin.ts  │  │
│  │  ─────────         ────────────      ──────────   ───────── │  │
│  │  POST /auth/       GET /balance      POST /api/*  GET /admin│  │
│  │    send-link       POST /topup       - xai/*      POST /admin│  │
│  │  GET /auth/        GET /usage        - openai/*     /config │  │
│  │    verify          POST /webhook     - amazon/*     /users  │  │
│  │  POST /auth/                                        /metrics│  │
│  │    refresh                                                  │  │
│  └────────────────────────────────────────────────────────────┘  │
│                               │                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                    Services (src/services/)                 │  │
│  │                                                             │  │
│  │  ledger.ts              wallet.ts            stripe.ts      │  │
│  │  ──────────             ──────────           ──────────     │  │
│  │  getBalance()           initWallet()         createSession()│  │
│  │  recordDeposit()        makeX402Request()    handleWebhook()│  │
│  │  recordUsage()          getWalletBalance()   calculateFees()│  │
│  │  getUsageHistory()                                          │  │
│  └────────────────────────────────────────────────────────────┘  │
│                               │                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                    Middleware (src/middleware/)             │  │
│  │                                                             │  │
│  │  auth.ts - Validate API key, attach user to context         │  │
│  │  ratelimit.ts - Basic rate limiting (future)                │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────┬──────────────────────────────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
          ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐
│    Supabase     │  │     Stripe      │  │   Corbits Network   │
│                 │  │                 │  │                     │
│  users          │  │  Checkout       │  │  xai.alez-848f79.   │
│  credits        │  │  Sessions       │  │    api.corbits.dev  │
│  transactions   │  │  Webhooks       │  │                     │
│                 │  │                 │  │  open-ai.alez-...   │
│                 │  │                 │  │                     │
│                 │  │                 │  │  amazon.alez-...    │
└─────────────────┘  └─────────────────┘  └─────────────────────┘
```

---

## Data Models

### Supabase Schema

```sql
-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  api_key TEXT UNIQUE NOT NULL,  -- Format: oc_XXXXXXXXXXXX
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Credits ledger (append-only for audit trail)
CREATE TABLE credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  amount DECIMAL(12,6) NOT NULL,  -- Positive = deposit, negative = usage
  type TEXT NOT NULL,  -- 'deposit' | 'usage' | 'refund'
  description TEXT,
  stripe_session_id TEXT,  -- For deposits
  request_id TEXT,  -- For usage (links to transactions)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Transaction log (API call records with cost breakdown)
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  request_id TEXT UNIQUE NOT NULL,  -- For idempotency
  endpoint TEXT NOT NULL,  -- 'xai' | 'openai' | 'amazon'
  path TEXT NOT NULL,  -- Full request path
  cost_x402 DECIMAL(12,6) NOT NULL,  -- What Corbits charged us (from x402 response)
  cost_margin DECIMAL(12,6) NOT NULL,  -- Our margin (cost_x402 * margin_percent)
  cost_total DECIMAL(12,6) NOT NULL,  -- What we charged user (cost_x402 + cost_margin)
  margin_percent DECIMAL(5,2) NOT NULL,  -- Margin % at time of transaction (for audit)
  response_status INTEGER,
  response_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Admin config (key-value store for settings)
CREATE TABLE config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT  -- Admin identifier
);

-- Default config values
INSERT INTO config (key, value) VALUES
  ('margin_global', '{"percent": 30}'),
  ('margin_xai', '{"percent": null}'),      -- null = use global
  ('margin_openai', '{"percent": null}'),   -- null = use global
  ('margin_amazon', '{"percent": null}'),   -- null = use global
  ('admin_password_hash', '{"hash": null}');  -- Set on first admin setup

-- Magic link tokens (short-lived)
CREATE TABLE magic_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_credits_user_id ON credits(user_id);
CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_created_at ON transactions(created_at);
CREATE INDEX idx_magic_links_token ON magic_links(token);
CREATE INDEX idx_magic_links_email ON magic_links(email);

-- Helper function: Get user balance
CREATE OR REPLACE FUNCTION get_user_balance(p_user_id UUID)
RETURNS DECIMAL AS $$
  SELECT COALESCE(SUM(amount), 0)
  FROM credits
  WHERE user_id = p_user_id;
$$ LANGUAGE SQL STABLE;
```

### TypeScript Types (packages/shared/src/types.ts)

```typescript
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
  description?: string;
  stripeSessionId?: string;
  requestId?: string;
  createdAt: Date;
};

// Transaction
export type Transaction = {
  id: string;
  userId: string;
  requestId: string;
  endpoint: 'xai' | 'openai' | 'amazon';
  path: string;
  costUsd: number;
  costActual: number;
  responseStatus?: number;
  responseTimeMs?: number;
  createdAt: Date;
};

// API Responses
export type BalanceResponse = {
  balance: number;  // USD
  currency: 'USD';
};

export type UsageResponse = {
  transactions: Transaction[];
  total: number;
  period: { start: Date; end: Date };
};

// Corbits Endpoints
export type CorbitsEndpoint = 'xai' | 'openai' | 'amazon';

export const CORBITS_URLS: Record<CorbitsEndpoint, string> = {
  xai: 'https://xai.alez-848f79.api.corbits.dev',
  openai: 'https://open-ai.alez-848f79.api.corbits.dev',
  amazon: 'https://amazon.alez-848f79.api.corbits.dev',
};

// Constants
export const DEFAULT_MARGIN_PERCENT = 30;  // Configurable via admin dashboard
export const STRIPE_FEE_PERCENT = 0.029;
export const STRIPE_FEE_FIXED = 0.30;
export const MIN_TOPUP_USD = 10;
export const LOW_BALANCE_THRESHOLD = 5;

// Admin config types
export type MarginConfig = {
  global: number;  // Default margin % (e.g., 30)
  perEndpoint: Partial<Record<CorbitsEndpoint, number>>;  // Optional overrides
};

export type AdminConfig = {
  margin: MarginConfig;
  walletAlertThreshold: number;  // Alert if USDC balance below this
};
```

---

## API Design

### Authentication Routes (`/auth/*`)

```
POST /auth/send-link
  Body: { email: string }
  Response: { success: true, message: "Check your email" }
  Action: Create magic link token, send email

GET /auth/verify?token=XXX
  Response: { apiKey: "oc_...", email: "..." }
  Action: Validate token, create user if new, return API key

POST /auth/refresh
  Headers: Authorization: Bearer <api_key>
  Response: { apiKey: "oc_..." }
  Action: Generate new API key, invalidate old one
```

### Credits Routes (`/credits/*`)

```
GET /balance
  Headers: Authorization: Bearer <api_key>
  Response: { balance: 45.23, currency: "USD" }

POST /topup
  Headers: Authorization: Bearer <api_key>
  Body: { amount: 50 }  // USD, minimum $10
  Response: { checkoutUrl: "https://checkout.stripe.com/..." }
  Action: Create Stripe session, return URL

GET /usage
  Headers: Authorization: Bearer <api_key>
  Query: ?days=7 (optional, default 30)
  Response: {
    transactions: [...],
    total: 12.34,
    period: { start: "...", end: "..." }
  }

POST /webhook
  Body: Stripe webhook payload
  Action: Verify signature, record deposit on checkout.session.completed
```

### Payment Gateway Routes (`/api/*`)

```
POST /api/xai/*
POST /api/openai/*
POST /api/amazon/*
  Headers: Authorization: Bearer <api_key>
  Body: <passthrough to Corbits>
  Response: <passthrough from Corbits>

  Flow:
  1. Validate API key
  2. Check user has sufficient balance (estimate based on endpoint type)
  3. Make x402 request to Corbits via @faremeter/fetch
  4. Get actual cost from x402 response (cost_x402)
  5. Get margin % from config (per-endpoint or global)
  6. Calculate: cost_margin = cost_x402 * (margin_percent / 100)
  7. Calculate: cost_total = cost_x402 + cost_margin
  8. Record in transactions table (with full cost breakdown)
  9. Deduct cost_total from user's credit balance
  10. Return Corbits response unchanged
```

### Admin Routes (`/admin/*`)

```
POST /admin/login
  Body: { password: string }
  Response: { token: string }  // Short-lived admin session token
  Action: Verify password hash, return session token

GET /admin/config
  Headers: Authorization: Bearer <admin_token>
  Response: {
    margin: { global: 30, perEndpoint: { xai: null, openai: null, amazon: null } },
    walletAlertThreshold: 1000
  }

POST /admin/config
  Headers: Authorization: Bearer <admin_token>
  Body: { margin?: { global?: number, perEndpoint?: {...} }, walletAlertThreshold?: number }
  Response: { success: true, config: {...} }
  Action: Update config values

GET /admin/users
  Headers: Authorization: Bearer <admin_token>
  Query: ?page=1&limit=50
  Response: {
    users: [{ id, email, balance, totalSpent, createdAt }],
    total: 150
  }

GET /admin/metrics
  Headers: Authorization: Bearer <admin_token>
  Query: ?days=30
  Response: {
    totalRevenue: 1234.56,      // cost_total sum
    totalCost: 863.19,          // cost_x402 sum
    totalMargin: 371.37,        // cost_margin sum
    totalTransactions: 5432,
    walletBalance: 8500.00,     // Current USDC balance
    activeUsers: 45,
    topEndpoints: [{ endpoint: 'openai', count: 3200, revenue: 800 }, ...]
  }

POST /admin/setup
  Body: { password: string }
  Response: { success: true }
  Action: Set initial admin password (only works if no password set)
  Note: One-time setup endpoint
```

---

## File Structure

```
openclawd/
├── .claude/
│   ├── commands/
│   │   └── openclawd.md              # Slash command router
│   └── skills/
│       └── openclawd/
│           ├── skill.md              # Main skill instructions
│           └── endpoints/
│               ├── xai.md            # xAI/Grok API docs
│               ├── openai.md         # OpenAI API docs
│               └── crossmint.md      # Crossmint/Amazon docs
├── apps/
│   └── api/
│       ├── src/
│       │   ├── index.ts              # Hono app entry
│       │   ├── routes/
│       │   │   ├── auth.ts           # Magic link auth
│       │   │   ├── credits.ts        # Balance, topup, webhook
│       │   │   ├── gateway.ts        # Payment gateway (Corbits x402)
│       │   │   └── admin.ts          # Admin dashboard API
│       │   ├── services/
│       │   │   ├── ledger.ts         # Credit operations
│       │   │   ├── wallet.ts         # Solana/x402
│       │   │   ├── stripe.ts         # Stripe integration
│       │   │   ├── email.ts          # Magic link emails
│       │   │   └── config.ts         # Admin config management
│       │   ├── middleware/
│       │   │   ├── auth.ts           # API key validation
│       │   │   └── admin-auth.ts     # Admin password validation
│       │   └── lib/
│       │       ├── supabase.ts       # DB client
│       │       └── errors.ts         # Error types
│       ├── vercel.json               # Vercel config
│       ├── package.json
│       └── tsconfig.json
├── packages/
│   └── shared/
│       ├── src/
│       │   ├── types.ts              # Shared types
│       │   └── constants.ts          # Shared constants
│       ├── package.json
│       └── tsconfig.json
├── scripts/
│   └── setup-db.ts                   # DB migration script
├── .githooks/
│   ├── pre-commit
│   └── commit-msg
├── CLAUDE.md
├── CONVENTIONS.md
├── Makefile
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── tsconfig.json
```

---

## Implementation Phases

### Phase 1: Foundation (Wave 1-2)
- Project scaffolding with faremeter conventions
- Supabase schema setup
- Shared types package

### Phase 2: Backend Core (Wave 3-4)
- Auth service (magic link)
- Ledger service
- Stripe integration

### Phase 3: Wallet & Proxy (Wave 5-6)
- Solana wallet setup
- x402 integration
- Corbits proxy routes

### Phase 4: Skill (Wave 7-8)
- Command router
- Skill logic
- Embedded endpoint docs

### Phase 5: Integration & QA (Wave 9-10)
- End-to-end testing
- Documentation
- Deployment config

---

## Environment Variables

### Backend (Vercel)

```env
# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Solana Wallet
SOLANA_PRIVATE_KEY=base58_encoded_key
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# Email (for magic links)
RESEND_API_KEY=re_...
FROM_EMAIL=noreply@openclawd.ai

# App
API_BASE_URL=https://api.openclawd.ai
```

### Skill (Local)

```
~/.openclawd/config.json
{
  "apiKey": "oc_...",
  "email": "user@example.com",
  "apiBaseUrl": "https://api.openclawd.ai"
}
```

---

## Security Considerations

1. **API Keys**: Generated server-side, never exposed in skill source
2. **Wallet Private Key**: Stored in Vercel secrets, never logged
3. **Stripe**: All card data handled by Stripe, webhook signatures verified
4. **Magic Links**: Expire in 15 minutes, single-use
5. **Rate Limiting**: Basic limits to prevent abuse (future enhancement)
6. **CORS**: Restrict to known origins in production
