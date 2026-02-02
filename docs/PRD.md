# Product Requirements Document (PRD)

## OpenClawd Corbits Skill - Agentic Commerce for Claude Code

---

## 1. Project Overview

### Problem Statement

Developers using Claude Code agents need access to powerful APIs (Solana RPCs, DEX aggregators, AI gateways, blockchain analytics) but face friction: API key management, account creation per service, complex billing. Meanwhile, x402/Corbits enables micropayment-based API access without accounts, but requires crypto wallet setup—a barrier for most developers.

### Proposed Solution

Build **OpenClawd**, a Claude Code skill that gives agents instant access to curated Corbits-hosted endpoints (xAI/Grok, OpenAI, Crossmint/Amazon) using a simple credit system. Users deposit dollars via credit card, see a dollar balance, and their agent pays per-request automatically. A hosted wallet (operated by us) handles all crypto complexity—users never touch USDC or Solana directly.

The skill includes **embedded API documentation** for each supported endpoint, so Claude knows exactly how to use them without fetching external docs.

### Success Metrics

- [ ] User can go from install to first API call in under 5 minutes
- [ ] Credit purchase flow completes in under 60 seconds
- [ ] 99.9% uptime for the proxy/wallet infrastructure
- [ ] 30% gross margin maintained on all credit purchases
- [ ] Support curated endpoints: xAI (Grok), OpenAI, Crossmint (Amazon)

---

## 2. User Stories

### Story 1: First-Time Setup

As a **Claude Code user**, I want to **install the OpenClawd skill and add credits** so that **my agent can immediately access Corbits APIs**.

**Acceptance Criteria:**
- [ ] Skill prompts for email on first use
- [ ] Magic link authentication (no passwords)
- [ ] Stripe Checkout opens in browser for credit purchase
- [ ] Balance shown after successful payment
- [ ] Auth token persists locally for future sessions

### Story 2: Making API Calls

As a **developer**, I want my **Claude agent to call Corbits endpoints transparently** so that **I don't have to manage API keys or crypto wallets**.

**Acceptance Criteria:**
- [ ] Agent can call xAI (Grok), OpenAI, and Crossmint (Amazon) APIs
- [ ] Skill includes embedded docs so Claude knows correct request formats
- [ ] API calls execute immediately without confirmation prompts (good UX)
- [ ] Credits deducted automatically based on x402 cost + configured margin
- [ ] Clear error if insufficient balance
- [ ] Response returned to agent seamlessly

### Story 5: Amazon Purchasing

As a **user**, I want my **agent to purchase items from Amazon** so that **I can automate shopping tasks**.

**Acceptance Criteria:**
- [ ] Agent can look up Amazon products by ASIN or URL using the crossmint api
- [ ] Agent shows price quote before purchasing
- [ ] User confirms purchase (agent doesn't auto-buy without approval)
- [ ] Order status trackable via skill
- [ ] Shipping address configurable

### Story 3: Balance Management

As a **user**, I want to **check my balance and add more credits anytime** so that **my agent never runs out of access mid-task**.

**Acceptance Criteria:**
- [ ] `/openclawd balance` shows current credit balance in dollars
- [ ] `/openclawd topup` opens Stripe for additional credits
- [ ] Low balance warning when below $5
- [ ] Usage history available (`/openclawd usage`)

### Story 4: Cost Transparency

As a **user**, I want to **understand what I'm being charged** so that **I can budget my API usage**.

**Acceptance Criteria:**
- [ ] Each API call executes without showing how much it costs beforehand
- [ ] Daily/weekly usage summary available via `/openclawd usage`
- [ ] All costs denominated in USD based on credits consumed
- [ ] Usage breakdown by endpoint type (xAI, OpenAI, Amazon)

### Story 6: Admin Configuration

As an **admin**, I want to **configure the margin charged on API calls** so that **I can control profitability**.

**Acceptance Criteria:**
- [ ] Password-protected admin dashboard at `/admin`
- [ ] Configure global margin % (default 30%)
- [ ] View hosted wallet USDC balance
- [ ] View all users and their credit balances
- [ ] View total usage and revenue metrics
- [ ] Per-endpoint margin override (optional, P2)

---

## 3. Core Features

| Priority | Feature | Description |
|----------|---------|-------------|
| P0 | Email + Magic Link Auth | Passwordless authentication via email verification |
| P0 | Credit Purchase (Stripe) | Buy credits with credit card, opens Stripe Checkout |
| P0 | Payment Gateway | Route skill requests through backend, pay Corbits via x402 (hosted wallet), deduct user credits automatically |
| P0 | Credit Ledger | Track deposits, usage, and balance per user (USD denominated) |
| P0 | Hosted Wallet | Solana wallet holding USDC, paying Corbits on users' behalf |
| P0 | Configurable Margin | Admin-configurable margin % charged on top of x402 cost (default 30%) |
| P0 | Admin Dashboard | Password-protected panel: configure margin %, view wallet balance, view all users/balances |
| P1 | Balance Display | `/openclawd balance` shows current credit balance in dollars |
| P1 | Usage History | Per-request transaction log showing cost breakdown (x402 cost + margin) |
| P1 | Low Balance Alerts | Warn when balance drops below threshold |
| P2 | Per-Endpoint Margin | Set different margin % for each Corbits endpoint (xAI vs OpenAI vs Amazon) |
| P2 | Webhook Notifications | Alert admins via webhook when wallet balance low |

---

## 4. Technical Constraints

### Required Technologies

- **Skill Runtime**: Claude Code slash command (TypeScript)
- **Backend**: Vercel Edge Functions (TypeScript)
- **Database**: Supabase (PostgreSQL + Auth helpers)
- **Payments**: Stripe Checkout + Webhooks
- **Blockchain**: Solana (USDC via SPL tokens)
- **x402 SDK**: `@faremeter/*` packages (required—no custom implementations)
- **Conventions**: Follow `faremeter-ts-playground` patterns exactly (pnpm monorepo, catalog versioning, strict TypeScript, Makefile)

### Constraints

- **Timeline**: MVP in 2-3 weeks
- **Team size**: Multi-agent parallel development
- **Existing code**: Greenfield, but must follow faremeter conventions
- **Wallet Security**: Private keys in environment variables (Vercel secrets), never exposed
- **PCI Compliance**: Stripe handles all card data—never touches our systems

---

## 5. Architecture

### System Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          User's Terminal                                 │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                Claude Code + OpenClawd Skill                       │  │
│  │                                                                    │  │
│  │  Commands:                                                         │  │
│  │  - /openclawd setup     → Email auth + initial credit purchase    │  │
│  │  - /openclawd balance   → Check current balance                   │  │
│  │  - /openclawd topup     → Add more credits (Stripe)               │  │
│  │  - /openclawd usage     → View usage history                      │  │
│  │  - /openclawd call <endpoint> <params>  → Make API call           │  │
│  │                                                                    │  │
│  │  Stored locally: ~/.openclawd/config.json (API key, email)        │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │ HTTPS (Bearer token)
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Backend API (Vercel)                             │
│                        api.openclaw.ai                                  │
│                                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────────┐  │
│  │    Auth      │  │   Credits    │  │     Payment Gateway          │  │
│  │   Service    │  │   Service    │  │    (NOT a Corbits proxy)     │  │
│  │              │  │              │  │                              │  │
│  │ POST /auth/  │  │ GET /balance │  │ POST /api/xai/*              │  │
│  │   send-link  │  │ POST /topup  │  │ POST /api/openai/*           │  │
│  │ GET /auth/   │  │ GET /usage   │  │ POST /api/amazon/*           │  │
│  │   verify     │  │              │  │                              │  │
│  │              │  │ Stripe       │  │ 1. Validate API key          │  │
│  │ Issues JWT   │  │ Webhook      │  │ 2. Check sufficient balance  │  │
│  │ + API key    │  │ Handler      │  │ 3. Call Corbits via x402     │  │
│  │              │  │              │  │ 4. Get actual cost from x402 │  │
│  └──────┬───────┘  └──────┬───────┘  │ 5. Add margin (from config)  │  │
│         │                 │          │ 6. Deduct total from credits │  │
│         │                 │          │ 7. Return Corbits response   │  │
│         │                 │          └──────────────┬───────────────┘  │
│         │                 │                         │                   │
│  ┌──────┴─────────────────┴─────────────────────────┴───────────────┐  │
│  │                      Admin Dashboard                              │  │
│  │                      /admin (password protected)                  │  │
│  │                                                                   │  │
│  │  - Configure global margin % (default 30%)                       │  │
│  │  - Per-endpoint margin override (xai: 25%, openai: 30%, etc.)   │  │
│  │  - View hosted wallet USDC balance                               │  │
│  │  - View all users and their credit balances                      │  │
│  │  - View usage metrics and revenue                                │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                           │                                              │
│                           ▼                                              │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                         Supabase                                   │  │
│  │                                                                    │  │
│  │  users              credits             transactions    config     │  │
│  │  ─────────────      ─────────────       ─────────────   ────────  │  │
│  │  id (uuid)          id (uuid)           id (uuid)       key       │  │
│  │  email (unique)     user_id (FK)        user_id (FK)    value     │  │
│  │  api_key (unique)   amount (decimal)    endpoint        updated_at│  │
│  │  created_at         type                cost_x402                  │  │
│  │                     stripe_session_id   cost_margin               │  │
│  │                     created_at          cost_total                │  │
│  │                                         response_status           │  │
│  │                                         created_at                │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                      Wallet Service                                │  │
│  │                                                                    │  │
│  │  - Single Solana wallet holding USDC                              │  │
│  │  - Private key in Vercel environment secrets                      │  │
│  │  - Uses @faremeter/wallet-solana for signing                      │  │
│  │  - Uses @faremeter/fetch for x402 requests                        │  │
│  │  - Monitors balance, alerts if < $1000                            │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │ x402 Protocol (USDC on Solana)
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    Corbits Network (Curated Endpoints)                   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  xAI (Grok)                                                      │    │
│  │  https://xai.alez-848f79.api.corbits.dev                        │    │
│  │  → AI chat completions (grok-4, grok-3, grok-2)                 │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  OpenAI                                                          │    │
│  │  https://open-ai.alez-848f79.api.corbits.dev                    │    │
│  │  → AI chat completions (gpt-4o, gpt-4-turbo, gpt-3.5-turbo)     │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  Crossmint (Amazon)                                              │    │
│  │  https://amazon.alez-848f79.api.corbits.dev                     │    │
│  │  → E-commerce: purchase 1B+ Amazon items via ASIN/URL           │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

### Payment Flow

```
User wants $50 in credits
         │
         ▼
┌─────────────────────────────┐
│ Calculate total with fees   │
│ Credits: $50.00             │
│ Stripe fee (2.9%+$0.30):    │
│   $50 × 0.029 + $0.30       │
│   = $1.75                   │
│ Total charged: $51.75       │
└───────────┬─────────────────┘
            │
            ▼
┌─────────────────────────┐
│ Stripe Checkout         │
│ Charges $51.75 to card  │
└───────────┬─────────────┘
            │ Webhook: checkout.session.completed
            ▼
┌─────────────────────────┐
│ Backend                 │
│ 1. Add $50 to ledger    │──────────────────────┐
│ 2. Convert to USDC:     │                      │
│    $50 × 0.70 = $35     │                      │
│ 3. Fund wallet with $35 │                      │
│    (manual for now)     │                      │
└─────────────────────────┘                      │
                                                 │
User makes API call costing $0.10 actual         │
         │                                       │
         ▼                                       │
┌─────────────────────────┐                      │
│ Proxy Service           │                      │
│ 1. Check balance ≥$0.10 │◄─────────────────────┘
│ 2. Call Corbits via x402│
│    (wallet pays $0.10)  │
│ 3. Deduct $0.10 from    │
│    user's ledger        │
│ 4. Return response      │
└─────────────────────────┘

Margin: User paid $51.75, receives $50 credits
        We have $35 USDC + $1.75 fee coverage
        When user spends full $50 (in ledger),
        we've only spent $35 actual = 30% margin
```

### Repository Structure

```
openclawd/                          # Main monorepo (faremeter conventions)
├── .claude/
│   ├── commands/
│   │   └── openclawd.md            # Slash command router
│   └── skills/
│       └── openclawd/
│           ├── skill.md            # Main skill logic
│           └── endpoints/          # Embedded API documentation
│               ├── xai.md          # xAI/Grok API docs for Claude
│               ├── openai.md       # OpenAI API docs for Claude
│               └── crossmint.md    # Crossmint/Amazon API docs for Claude
├── apps/
│   ├── api/                        # Vercel API (Edge Functions)
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   │   ├── auth.ts         # Magic link, verify, JWT
│   │   │   │   ├── credits.ts      # Balance, topup, webhook
│   │   │   │   └── proxy.ts        # Corbits proxy
│   │   │   ├── services/
│   │   │   │   ├── ledger.ts       # Credit ledger operations
│   │   │   │   ├── wallet.ts       # Solana wallet + x402
│   │   │   │   └── stripe.ts       # Stripe integration
│   │   │   └── index.ts            # Hono app entry
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── skill/                      # Claude Code skill package
│       ├── src/
│       │   ├── commands/
│       │   │   ├── setup.ts
│       │   │   ├── balance.ts
│       │   │   ├── topup.ts
│       │   │   ├── usage.ts
│       │   │   └── call.ts
│       │   ├── lib/
│       │   │   ├── api-client.ts   # HTTP client to backend
│       │   │   ├── config.ts       # Local config management
│       │   │   └── auth.ts         # Token storage
│       │   └── index.ts
│       └── package.json
├── packages/
│   └── shared/                     # Shared types and utilities
│       ├── src/
│       │   ├── types.ts
│       │   └── constants.ts
│       └── package.json
├── CLAUDE.md
├── CONVENTIONS.md
├── Makefile
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── tsconfig.json
```

---

## 6. Supported Endpoints (MVP)

The skill supports a **curated set** of Corbits-proxied APIs. Each endpoint has embedded documentation in the skill so Claude knows how to use them correctly.

### 6.1 xAI (Grok) - AI Chat/Completions

**Corbits Endpoint**: `https://xai.alez-848f79.api.corbits.dev`

**Underlying API**: xAI Responses API (OpenAI-compatible)

**Embedded Documentation for Claude**:
```
xAI Grok API - OpenAI-compatible chat completions

POST /v1/responses
POST /v1/chat/completions (deprecated but supported)

Request format:
{
  "model": "grok-4",           // or "grok-3", "grok-2"
  "messages": [
    {"role": "system", "content": "..."},
    {"role": "user", "content": "..."}
  ],
  "temperature": 0.7,          // optional, 0-2
  "max_tokens": 1024,          // optional
  "stream": false              // optional, true for streaming
}

Response format:
{
  "id": "resp_...",
  "object": "response",
  "model": "grok-4",
  "choices": [{
    "index": 0,
    "message": {"role": "assistant", "content": "..."},
    "finish_reason": "stop"
  }],
  "usage": {"prompt_tokens": N, "completion_tokens": N, "total_tokens": N}
}

Models: grok-4 (most capable), grok-3, grok-2
```

### 6.2 OpenAI - AI Chat/Completions

**Corbits Endpoint**: `https://open-ai.alez-848f79.api.corbits.dev`

**Underlying API**: OpenAI Chat Completions API

**Embedded Documentation for Claude**:
```
OpenAI Chat Completions API

POST /v1/chat/completions

Request format:
{
  "model": "gpt-4o",           // or "gpt-4-turbo", "gpt-3.5-turbo"
  "messages": [
    {"role": "system", "content": "..."},
    {"role": "user", "content": "..."}
  ],
  "temperature": 0.7,          // optional, 0-2
  "max_tokens": 1024,          // optional
  "stream": false,             // optional
  "response_format": {"type": "json_object"}  // optional, for JSON mode
}

Response format:
{
  "id": "chatcmpl-...",
  "object": "chat.completion",
  "model": "gpt-4o",
  "choices": [{
    "index": 0,
    "message": {"role": "assistant", "content": "..."},
    "finish_reason": "stop"
  }],
  "usage": {"prompt_tokens": N, "completion_tokens": N, "total_tokens": N}
}

Models: gpt-4o (recommended), gpt-4-turbo, gpt-4, gpt-3.5-turbo
```

### 6.3 Crossmint (Amazon) - E-Commerce Purchasing

**Corbits Endpoint**: `https://amazon.alez-848f79.api.corbits.dev`

**Underlying API**: Crossmint Headless Checkout API

**Embedded Documentation for Claude**:
```
Crossmint Headless Checkout - Amazon Purchases

Can purchase 1B+ Amazon items programmatically.

POST /api/v1/orders
Create an order for an Amazon product

Request format:
{
  "productLocator": "amazon:B01DFKC2SO",  // ASIN format
  // OR
  "productLocator": "amazon:https://www.amazon.com/dp/B01DFKC2SO",  // URL format

  "quantity": 1,
  "shippingAddress": {
    "name": "John Doe",
    "line1": "123 Main St",
    "line2": "Apt 4",          // optional
    "city": "San Francisco",
    "state": "CA",
    "postalCode": "94102",
    "country": "US"
  },
  "email": "user@example.com"  // for order confirmation
}

Response format:
{
  "orderId": "order_...",
  "status": "pending",
  "productDetails": {
    "title": "Product Name",
    "price": {"amount": "29.99", "currency": "USD"},
    "imageUrl": "https://..."
  },
  "quote": {
    "subtotal": "29.99",
    "shipping": "5.99",
    "tax": "2.87",
    "total": "38.85"
  }
}

GET /api/v1/orders/{orderId}
Check order status

POST /api/v1/orders/{orderId}/pay
Confirm and pay for order (uses your OpenClawd credits)

Order statuses: pending → payment_required → processing → shipped → delivered
```

---

## 7. Out of Scope (v1)

- Web dashboard for usage analytics (CLI-only for MVP)
- Multiple wallet support / user's own wallet
- Crypto-native credit purchases (credit card only)
- Refunds (manual process initially)
- Multi-currency support (USD only)
- Rate limiting (trust-based initially, add later)
- Team/organization accounts
- Additional Corbits endpoints (Helius, Jupiter, etc.) - add post-MVP

---

## 8. Resolved Decisions

| Question | Decision | Rationale |
|----------|----------|-----------|
| Wallet Funding | Manual initially, Circle API later | Start simple; design for automation |
| Stripe Fees | Pass to user | 2.9% + $0.30 added to topup amount |
| Minimum Topup | $10 | Balances tx costs (5.9% effective) vs accessibility |
| Endpoints | Curated (xAI, OpenAI, Crossmint) | Better UX with embedded docs; expand later |
| API Knowledge | Embedded in skill | Claude reads docs from skill.md, no external fetches |

**Future Enhancement**: When user tops up, automatically:
1. Capture 30% margin
2. Convert remaining 70% to USDC via Circle API
3. Fund hosted wallet

This ensures wallet never runs dry as usage scales.

---

## 9. References

- Corbits Documentation: https://docs.corbits.dev/
- Faremeter SDK: https://github.com/faremeter/faremeter-ts-playground
- x402 Protocol: https://docs.corbits.dev/llms.txt
- Stripe Checkout: https://stripe.com/docs/payments/checkout
- Supabase: https://supabase.com/docs

---

## Checklist Before Planning

- [x] Problem statement is clear
- [x] At least 3 user stories with acceptance criteria
- [x] Features are prioritized
- [x] Technical constraints are documented
- [x] Architecture diagram included
- [x] Open questions are listed (will be resolved during planning)

**Ready?** Run `/multi-agent plan docs/PRD.md`
