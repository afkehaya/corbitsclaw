# Product Requirements Document (PRD)

## CorbitsClaw - Agentic Commerce for Claude Code

---

## 1. Project Overview

### Problem Statement

Developers using Claude Code agents need access to powerful APIs (Solana RPCs, DEX aggregators, AI gateways, blockchain analytics, e-commerce) but face friction: API key management, account creation per service, complex billing. Meanwhile, x402/Corbits enables micropayment-based API access without accounts, but requires crypto wallet setup -- a barrier for most developers.

### Proposed Solution

Build **CorbitsClaw**, a Claude Code skill and hosted gateway that gives agents instant access to **any** Corbits-hosted API proxy using a simple USD credit system. Users deposit dollars via credit card, see a dollar balance, and their agent pays per-request automatically. A hosted wallet (operated by us) handles all crypto complexity -- users never touch USDC or Solana directly.

Endpoint discovery is handled by the **corbits-skill** (`/corbits`), which uses the Corbits Discovery API to search, browse, and explore any available proxy and its OpenAPI spec. CorbitsClaw does not hardcode or curate endpoints -- it supports any proxy on the Corbits platform.

### Success Metrics

- [ ] User can go from install to first API call in under 5 minutes
- [ ] Credit purchase flow completes in under 60 seconds
- [ ] 99.9% uptime for the gateway/wallet infrastructure
- [ ] 30% gross margin maintained on all credit purchases
- [ ] Any Corbits proxy accessible via the gateway (not limited to specific endpoints)

---

## 2. User Stories

### Story 1: First-Time Setup

As a **Claude Code user**, I want to **install the CorbitsClaw skill and add credits** so that **my agent can immediately access Corbits APIs**.

**Acceptance Criteria:**

- [ ] Skill prompts for email on first use
- [ ] Magic link authentication (no passwords)
- [ ] Stripe Checkout opens in browser for credit purchase
- [ ] Balance shown after successful payment
- [ ] Auth token persists locally for future sessions

### Story 2: Discovering and Calling APIs

As a **developer**, I want my **Claude agent to discover and call any Corbits endpoint transparently** so that **I don't have to manage API keys or crypto wallets**.

**Acceptance Criteria:**

- [ ] Agent can discover any Corbits proxy via `/corbits search <query>`
- [ ] Agent can browse a proxy's endpoints via `/corbits list`
- [ ] Agent can see pricing before calling via `/corbits call`
- [ ] API calls route through the CorbitsClaw gateway for credit-based billing
- [ ] Credits deducted automatically based on x402 cost + configured margin
- [ ] Clear error if insufficient balance
- [ ] Response returned to agent seamlessly

### Story 3: Balance Management

As a **user**, I want to **check my balance and add more credits anytime** so that **my agent never runs out of access mid-task**.

**Acceptance Criteria:**

- [ ] `/corbitsclaw balance` shows current credit balance in dollars
- [ ] `/corbitsclaw topup` opens Stripe for additional credits
- [ ] Low balance warning when below $5
- [ ] Usage history available (`/corbitsclaw usage`)

### Story 4: Cost Transparency

As a **user**, I want to **understand what I'm being charged** so that **I can budget my API usage**.

**Acceptance Criteria:**

- [ ] Each API call executes without showing cost beforehand (low friction)
- [ ] Daily/weekly usage summary available via `/corbitsclaw usage`
- [ ] All costs denominated in USD based on credits consumed
- [ ] Usage breakdown by proxy name

### Story 5: Admin Configuration

As an **admin**, I want to **configure the margin charged on API calls** so that **I can control profitability**.

**Acceptance Criteria:**

- [ ] Password-protected admin endpoints at `/admin`
- [ ] Configure global margin % (default 30%)
- [ ] View all users and their credit balances
- [ ] View total usage and revenue metrics

---

## 3. Core Features

| Priority | Feature                  | Description                                                                                     |
| -------- | ------------------------ | ----------------------------------------------------------------------------------------------- |
| P0       | Email + Magic Link Auth  | Passwordless authentication via email verification                                              |
| P0       | Credit Purchase (Stripe) | Buy credits with credit card via Stripe Checkout                                                |
| P0       | Dynamic Payment Gateway  | Route requests to any Corbits proxy via x402 (hosted wallet), deduct user credits automatically |
| P0       | Credit Ledger            | Track deposits, usage, and balance per user (USD denominated)                                   |
| P0       | Hosted Wallet            | Solana wallet holding USDC, paying Corbits on users' behalf via `@faremeter/rides`              |
| P0       | Corbits Discovery        | Endpoint discovery via corbits-skill (`/corbits search`, `/corbits list`, `/corbits call`)      |
| P0       | Configurable Margin      | Admin-configurable margin % charged on top of x402 cost (default 30%)                           |
| P1       | Balance Display          | `/corbitsclaw balance` shows current credit balance in dollars                                  |
| P1       | Usage History            | Per-request transaction log showing cost breakdown (x402 cost + margin)                         |
| P1       | Low Balance Alerts       | Warn when balance drops below threshold                                                         |
| P1       | Admin Dashboard          | Password-protected endpoints: configure margin %, view users/balances                           |
| P2       | Per-Proxy Margin         | Set different margin % for specific Corbits proxies                                             |
| P2       | Webhook Notifications    | Alert admins via webhook when wallet balance low                                                |

---

## 4. Technical Constraints

### Required Technologies

- **Skill Runtime**: Claude Code slash commands (markdown-based skills)
- **Backend**: Vercel Edge Functions (TypeScript, Hono framework)
- **Database**: Supabase (PostgreSQL)
- **Payments**: Stripe Checkout + Webhooks
- **Blockchain**: Solana (USDC via `@faremeter/rides`)
- **x402 SDK**: `@faremeter/rides` -- single package handles wallet setup and x402 payments
- **Discovery**: Corbits Discovery API (`https://api.corbits.dev/api/v1/`)
- **Conventions**: Follow `faremeter-ts-playground` patterns (pnpm monorepo, catalog versioning, strict TypeScript, Makefile)

### Constraints

- **Team size**: Multi-agent parallel development
- **Existing code**: Refactoring from initial prototype (previously named OpenClawd)
- **Wallet Security**: Private keys in environment variables (Vercel secrets), never exposed
- **PCI Compliance**: Stripe handles all card data -- never touches our systems
- **No hardcoded endpoints**: Gateway supports any Corbits proxy, not a curated list

---

## 5. Architecture

### System Diagram

```
+-----------------------------------------------------------------------+
|                          User's Terminal                               |
|  +----------------------------------+  +---------------------------+  |
|  |   CorbitsClaw Skill              |  |   Corbits Skill           |  |
|  |   /corbitsclaw                   |  |   /corbits                |  |
|  |                                  |  |                           |  |
|  |   setup  - Auth + credits        |  |   search - Find proxies   |  |
|  |   balance - Check balance        |  |   list   - Show endpoints |  |
|  |   topup  - Add credits           |  |   call   - Make API call  |  |
|  |   usage  - View history          |  |   init   - Wallet setup   |  |
|  |                                  |  |   status - Current proxy  |  |
|  |   Config: ~/.corbitsclaw/        |  |                           |  |
|  |           config.json            |  |   Config: ~/.config/      |  |
|  |                                  |  |           corbits/        |  |
|  +----------------+-----------------+  +------------+--------------+  |
+-------------------|-----------------------------|---------+-----------+
                    | HTTPS (Bearer token)        |         |
                    v                             |         |
+---------------------------------------+        |         |
|  CorbitsClaw Backend API (Vercel)      |        |         |
|  https://clawdmeter.vercel.app        |        |         |
|                                       |        |         |
|  Auth Service       Credits Service   |        |         |
|  POST /auth/        GET /credits/     |        |         |
|    send-link          balance         |        |         |
|  GET /auth/         GET /credits/     |        |         |
|    verify             usage           |        |         |
|  POST /auth/        POST /stripe/     |        |         |
|    refresh            checkout        |        |         |
|                                       |        |         |
|  Dynamic Payment Gateway              |        |         |
|  POST /gateway/:proxy/*              |        |         |
|                                       |        |         |
|  1. Validate API key (Bearer token)   |        |         |
|  2. Resolve proxy name -> URL         |        |         |
|     (Corbits Discovery API, cached)   |        |         |
|  3. Check sufficient balance          |        |         |
|  4. Call proxy via x402               |        |         |
|     (@faremeter/rides)                |        |         |
|  5. Extract cost from x402 headers    |        |         |
|  6. Add margin (from admin config)    |        |         |
|  7. Deduct total from user credits    |        |         |
|  8. Return proxy response             |        |         |
|                                       |        |         |
|  Wallet Service (@faremeter/rides)    |        |         |
|  - SOLANA_PRIVATE_KEY from env        |        |         |
|  - payer.addLocalWallet() on init     |        |         |
|  - payer.fetch() for x402 requests    |        |         |
|                                       |        |         |
|  Admin: /admin (X-Admin-Key header)   |        |         |
|  - Configure margin %                 |        |         |
|  - View users and balances            |        |         |
|                                       |        |         |
|  Supabase (PostgreSQL)                |        |         |
|  - users (id, email, api_key_hash)    |        |         |
|  - credits (append-only ledger)       |        |         |
|  - transactions (cost breakdown)      |        |         |
|  - magic_links (auth tokens)          |        |         |
|  - admin_settings (key-value config)  |        |         |
+-------------------+-------------------+        |         |
                    |                             |         |
                    | x402 (USDC on Solana)        |         |
                    v                             v         v
+-----------------------------------------------------------------------+
|                    Corbits Platform                                    |
|                    https://api.corbits.dev                            |
|                                                                       |
|  Discovery API                                                        |
|  GET /api/v1/search?q=<query>     Search proxies + endpoints         |
|  GET /api/v1/proxies               List all proxies                  |
|  GET /api/v1/proxies/:id           Proxy detail                      |
|  GET /api/v1/proxies/:id/openapi   OpenAPI spec                      |
|  GET /api/v1/proxies/:id/endpoints Endpoint list + pricing           |
|                                                                       |
|  API Proxies (examples -- any proxy is supported)                     |
|  https://<name>.api.corbits.dev                                      |
|  https://<name>.<org>.api.corbits.dev                                |
|                                                                       |
|  xAI, OpenAI, Amazon/Crossmint, Helius, Jupiter, and more            |
+-----------------------------------------------------------------------+
```

### Payment Flow

```
User wants $50 in credits
         |
         v
+-----------------------------+
| Calculate total with fees   |
| Credits: $50.00             |
| Stripe fee (2.9%+$0.30):   |
|   $50 x 0.029 + $0.30      |
|   = $1.75                   |
| Total charged: $51.75       |
+-------------+---------------+
              |
              v
+-------------------------+
| Stripe Checkout         |
| Charges $51.75 to card  |
+-------------+-----------+
              | Webhook: checkout.session.completed
              v
+-------------------------+
| Backend                 |
| 1. Add $50 to ledger    |----------------------+
| 2. Convert to USDC:     |                      |
|    $50 x 0.70 = $35     |                      |
| 3. Fund wallet with $35 |                      |
|    (manual for now)      |                      |
+-------------------------+                      |
                                                 |
User makes API call costing $0.10 actual         |
         |                                       |
         v                                       |
+-------------------------+                      |
| Gateway                 |                      |
| 1. Resolve proxy name   |<---------------------+
| 2. Check balance >= $0.01|
| 3. Call proxy via x402   |
|    (wallet pays $0.10)   |
| 4. Add 30% margin        |
|    ($0.10 + $0.03 = $0.13)|
| 5. Deduct $0.13 from     |
|    user's ledger          |
| 6. Return response       |
+-------------------------+

Margin: User paid $51.75, receives $50 credits
        We have $35 USDC + $1.75 fee coverage
        When user spends full $50 (in ledger),
        we've only spent ~$35 actual = 30% margin
```

### Gateway Proxy Resolution

The gateway dynamically resolves proxy names to URLs using the Corbits Discovery API:

```
POST /gateway/openai/v1/chat/completions
                 |       |
                 |       +-- path: /v1/chat/completions
                 +---------- proxy: "openai"

Resolution:
1. Check in-memory cache for "openai" -> URL mapping
2. On cache miss: GET https://api.corbits.dev/api/v1/search?q=openai
3. Extract proxy URL from result (e.g., https://open-ai.alez-848f79.api.corbits.dev)
4. Cache with 5-minute TTL
5. Forward request to resolved URL via x402
```

### Repository Structure

```
corbitsclaw/                         # Main monorepo (faremeter conventions)
+-- .claude/
|   +-- commands/
|   |   +-- corbitsclaw.md           # Slash command router
|   +-- skills/
|       +-- corbitsclaw/             # Credit management skill
|       |   +-- skill.md             # Setup, balance, topup, usage
|       |   +-- README.md            # Skill documentation
|       +-- corbits/                 # Corbits discovery skill (from corbits-infra)
|           +-- SKILL.md             # Discovery, search, call
|           +-- VERSION              # Skill version
+-- apps/
|   +-- api/                         # Vercel API (Edge Functions)
|       +-- src/
|       |   +-- routes/
|       |   |   +-- auth.ts          # Magic link, verify, refresh
|       |   |   +-- credits.ts       # Balance, usage
|       |   |   +-- gateway.ts       # Dynamic proxy gateway
|       |   |   +-- stripe.ts        # Stripe checkout + webhooks
|       |   |   +-- admin.ts         # Admin endpoints
|       |   +-- services/
|       |   |   +-- ledger.ts        # Credit ledger operations
|       |   |   +-- wallet.ts        # @faremeter/rides wallet + x402
|       |   |   +-- config.ts        # Admin settings (margin, etc.)
|       |   |   +-- proxy-resolver.ts # Corbits Discovery API client + cache
|       |   |   +-- email.ts         # Magic link emails (Resend)
|       |   +-- middleware/
|       |   |   +-- auth.ts          # API key validation middleware
|       |   +-- lib/
|       |   |   +-- errors.ts        # Error classes
|       |   |   +-- supabase.ts      # Supabase client
|       |   +-- index.ts             # Hono app entry
|       +-- package.json
|       +-- tsconfig.json
+-- packages/
|   +-- shared/                      # Shared types and constants
|       +-- src/
|       |   +-- types.ts
|       |   +-- constants.ts
|       +-- package.json
+-- scripts/
|   +-- setup-db.ts                  # Database schema SQL
+-- docs/
|   +-- PRD.md                       # This document
|   +-- TECHNICAL.md                 # Generated technical spec
+-- corbits-skill/                   # Source copy of corbits-skill repo
+-- CLAUDE.md
+-- CONVENTIONS.md
+-- DEPLOYMENT.md
+-- README.md
+-- Makefile
+-- package.json
+-- pnpm-workspace.yaml
+-- tsconfig.base.json
+-- vercel.json
```

---

## 6. Endpoint Discovery (via Corbits Skill)

CorbitsClaw does **not** hardcode or curate endpoints. All endpoint discovery is handled by the corbits-skill, which uses the Corbits Discovery API.

### Discovery Flow

1. User runs `/corbits search <query>` to find proxies (e.g., `/corbits search openai`)
2. Corbits-skill presents matching proxies with name, URL, tags, and pricing
3. User selects a proxy; corbits-skill saves context to `~/.config/corbits/context.json`
4. User runs `/corbits list` to see available endpoints for the selected proxy
5. User runs `/corbits call` to make a request -- this can route through the CorbitsClaw gateway for credit-based billing

### Gateway Integration

When the agent makes API calls through the CorbitsClaw gateway (`POST /gateway/:proxy/*`), the gateway:

1. Extracts the proxy name from the URL path
2. Resolves the name to a Corbits proxy URL via the Discovery API (cached)
3. Forwards the request using `@faremeter/rides` with the hosted wallet
4. Extracts cost from x402 response headers
5. Applies margin and deducts from user's credit balance

### Available Proxies

Any active proxy on the Corbits platform is supported. Examples include:

- AI APIs (xAI/Grok, OpenAI, Anthropic)
- Blockchain RPCs (Helius, QuickNode)
- DEX aggregators (Jupiter)
- E-commerce (Crossmint/Amazon)
- And any future proxy added to Corbits

---

## 7. Two-Skill Architecture

CorbitsClaw uses two complementary skills:

| Skill           | Command        | Purpose                                             |
| --------------- | -------------- | --------------------------------------------------- |
| **corbitsclaw** | `/corbitsclaw` | Credit management: setup, balance, topup, usage     |
| **corbits**     | `/corbits`     | API discovery and calling: search, list, call, init |

**corbitsclaw** handles the money side:

- `/corbitsclaw setup` -- Email auth + initial credit purchase
- `/corbitsclaw balance` -- Check credit balance
- `/corbitsclaw topup [amount]` -- Add credits ($10, $25, $50, $100)
- `/corbitsclaw usage [days]` -- View transaction history

**corbits** handles the API side:

- `/corbits search <query>` -- Find proxies on Corbits
- `/corbits list` -- Show endpoints for current proxy
- `/corbits call [filter]` -- Pick an endpoint and call it
- `/corbits init` -- Set up wallet keys (for direct x402, not required for gateway)
- `/corbits status` -- Show current proxy

Users who want to pay with their own crypto wallet can use `/corbits` directly (it uses `@faremeter/rides` with local wallet keys). Users who want USD credit-based billing use the CorbitsClaw gateway, which is transparent -- the gateway URL is substituted for the direct proxy URL.

---

## 8. Out of Scope (v1)

- Web dashboard for usage analytics (CLI-only for MVP)
- Multiple hosted wallets / user's own wallet for gateway
- Crypto-native credit purchases (credit card only)
- Refunds (manual process initially)
- Multi-currency support (USD only)
- Rate limiting (trust-based initially, add later)
- Team/organization accounts

---

## 9. Resolved Decisions

| Question       | Decision                                   | Rationale                                            |
| -------------- | ------------------------------------------ | ---------------------------------------------------- |
| Wallet Funding | Manual initially, Circle API later         | Start simple; design for automation                  |
| Stripe Fees    | Pass to user                               | 2.9% + $0.30 added to topup amount                   |
| Minimum Topup  | $10                                        | Balances tx costs (5.9% effective) vs accessibility  |
| Endpoints      | Dynamic via Corbits Discovery API          | Better UX than curated list; supports all proxies    |
| API Knowledge  | Corbits-skill fetches OpenAPI specs        | No embedded docs needed; specs always up to date     |
| x402 SDK       | `@faremeter/rides` (single package)        | Replaces 3 separate faremeter packages; simpler      |
| RPC Setup      | Let `@faremeter/rides` manage RPC          | No dual-RPC needed; rides handles payment internally |
| API Domain     | Vercel subdomain (`clawdmeter.vercel.app`) | No custom domain needed for MVP                      |
| Project Name   | CorbitsClaw (renamed from OpenClawd)       | Better brand alignment with Corbits platform         |

**Future Enhancement**: When user tops up, automatically:

1. Capture 30% margin
2. Convert remaining 70% to USDC via Circle API
3. Fund hosted wallet

This ensures wallet never runs dry as usage scales.

---

## 10. Refactoring Tasks (from OpenClawd -> CorbitsClaw)

This project is being refactored from an initial prototype (OpenClawd). The following changes are required:

### 10.1 Rename: openclawd -> corbitsclaw

All references to "openclawd", "OpenClawd", "OPENCLAWD", and "openclaw.ai" must be renamed:

- Package names: `@openclawd/*` -> `@corbitsclaw/*`
- Skill directory: `.claude/skills/openclawd/` -> `.claude/skills/corbitsclaw/`
- Command file: `.claude/commands/openclawd.md` -> `.claude/commands/corbitsclaw.md`
- Config path: `~/.openclawd/config.json` -> `~/.corbitsclaw/config.json`
- Environment variable: `OPENCLAWD_API_URL` -> `CORBITSCLAW_API_URL`
- API URL: `api.openclaw.ai` -> `clawdmeter.vercel.app`
- All imports, docs, README, CLAUDE.md

### 10.2 Wallet Service: Replace 3 packages with @faremeter/rides

**Remove from apps/api:**

- `@faremeter/wallet-solana`
- `@faremeter/payment-solana`
- `@faremeter/fetch`
- `@solana/web3.js`
- `@solana/spl-token`
- `bs58`

**Add:**

- `@faremeter/rides` (add to pnpm-workspace.yaml catalog + apps/api/package.json)

**Rewrite `wallet.ts`:**

- Use `payer.addLocalWallet(process.env.SOLANA_PRIVATE_KEY)` for init
- Use `payer.fetch(url, options)` for x402 requests
- Delete dual-RPC setup (bootstrapConnection, heliusConnection)
- Delete `getWalletBalance()` (dead code, never called)
- Keep `X402CostMissingError` for cost validation
- Keep `X402RequestResult` interface for type safety

### 10.3 Dynamic Gateway: Replace hardcoded endpoints

**Remove:**

- `CorbitsEndpoint` type (`'xai' | 'openai' | 'amazon'` union)
- `CORBITS_URLS` constant (hardcoded map of 3 URLs)
- 3 static gateway routes (`/gateway/xai/*`, `/gateway/openai/*`, `/gateway/amazon/*`)
- Embedded endpoint docs (`.claude/skills/corbitsclaw/endpoints/`)
- Chat model mapping in skill

**Add:**

- Dynamic route: `POST /gateway/:proxy/*`
- New service: `proxy-resolver.ts` -- resolves proxy names to URLs via Corbits Discovery API with in-memory caching (5-minute TTL)
- Transaction `endpoint` column stores proxy name as unconstrained `TEXT` (remove CHECK constraint)

### 10.4 Install corbits-skill

Copy `corbits-skill/SKILL.md` and `corbits-skill/VERSION` into `.claude/skills/corbits/` so `/corbits` is available for endpoint discovery.

### 10.5 Simplify corbitsclaw skill

Remove endpoint-specific commands and embedded API docs. Focus on credit management only:

- setup, balance, topup, usage
- Remove xai/openai/amazon commands
- Remove chat model mapping
- Remove endpoint docs directory

### 10.6 Remove debug/test routes

Delete from `gateway.ts`:

- `POST /gateway/noop`
- `POST /gateway/step1` through `step4`
- `GET /gateway/ping`
- `POST /gateway/test`

### 10.7 Fix build system

- Makefile `build` target: add `pnpm -r build`
- Makefile `test` target: add `pnpm -r test`
- Run `make format` to fix prettier issues

### 10.8 Fix gateway path passthrough bug

Current code always passes `'/'` as path to `makeX402Request`, ignoring the actual path from the URL. Fix to pass the real path extracted from the route.

---

## 11. Production Hardening

### 11.1 Previously Completed (from audit)

These items have already been addressed in the codebase:

- SEC-2: Debug endpoints gated behind production check
- SEC-3: API keys hashed with bcrypt (api_key_hash, api_key_prefix)
- REL-1: Gateway fails request if usage recording fails
- REL-2: X402CostMissingError validates cost headers

### 11.2 Remaining Items

| ID    | Issue                              | Fix                                                                         |
| ----- | ---------------------------------- | --------------------------------------------------------------------------- |
| SEC-1 | Race condition in balance checking | Use database transaction with row-level locking for atomic check-and-deduct |
| SEC-4 | No rate limiting                   | Add rate limiting middleware                                                |
| REL-3 | Admin settings not used by gateway | Read margin from admin_settings table with caching                          |
| CQ-2  | Missing input validation           | Add schema validation for request bodies                                    |
| UX-1  | No low balance warning             | Add X-Balance-Warning header when balance < $5                              |

---

## 12. Database Schema

### Schema Changes for Refactor

The `transactions` table `endpoint` column CHECK constraint must be removed to support dynamic proxy names:

```sql
-- Remove the hardcoded endpoint constraint
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_endpoint_check;

-- The endpoint column now stores any proxy name as TEXT
-- e.g., 'openai', 'xai', 'helius', 'jupiter', etc.
```

### Current Schema (reference)

See `scripts/setup-db.ts` for the full schema. Key tables:

- **users**: id, email, api_key_hash, api_key_prefix, created_at, updated_at
- **credits**: id, user_id, amount, type, description, stripe_session_id, request_id, created_at
- **transactions**: id, user_id, request_id, endpoint (TEXT), path, cost_x402, cost_margin, cost_total, margin_percent, response_status, response_time_ms, created_at
- **magic_links**: id, email, token, expires_at, used_at, created_at
- **admin_settings**: key, value, updated_at
- **config**: key, value, updated_at

---

## 13. References

- Corbits Platform: https://api.corbits.dev
- Corbits Skill: https://github.com/corbits-infra/corbits-skill
- Faremeter Rides: https://www.npmjs.com/package/@faremeter/rides
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
- [x] Refactoring tasks documented
- [x] Production hardening requirements documented
- [x] Database schema changes identified

**Ready?** Run `/multi-agent plan docs/PRD.md`
