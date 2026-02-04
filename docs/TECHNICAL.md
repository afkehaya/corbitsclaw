# Technical Specification

## CorbitsClaw - Refactor from OpenClawd

Generated from `docs/PRD.md` sections 10-12.

---

## Tech Stack

| Layer     | Technology                        | Rationale                                               |
| --------- | --------------------------------- | ------------------------------------------------------- |
| Backend   | Hono + Vercel Edge Functions      | Already in use, performant edge runtime                 |
| Database  | Supabase (PostgreSQL)             | Already in use, managed hosting                         |
| Payments  | Stripe Checkout + Webhooks        | Already in use, PCI compliant                           |
| x402      | `@faremeter/rides`                | Single package replaces 3 faremeter + 3 solana packages |
| Discovery | Corbits Discovery API             | Dynamic proxy resolution, no hardcoded endpoints        |
| Email     | Resend (via fetch)                | Already in use for magic links                          |
| Skills    | Markdown-based Claude Code skills | Already in use                                          |
| Build     | pnpm monorepo + Makefile          | Faremeter conventions                                   |

---

## Architecture Changes

### Current State (OpenClawd)

```
Wallet: 3 faremeter packages + 3 solana packages + dual RPC
Gateway: 3 hardcoded routes (/gateway/xai/*, /gateway/openai/*, /gateway/amazon/*)
Types: CorbitsEndpoint = 'xai' | 'openai' | 'amazon'
Constants: CORBITS_URLS = { xai: '...', openai: '...', amazon: '...' }
Skill: Embedded endpoint docs, chat model mapping, endpoint-specific commands
Name: OpenClawd / @openclawd/* / ~/.openclawd/ / api.openclaw.ai
```

### Target State (CorbitsClaw)

```
Wallet: @faremeter/rides only (payer.addLocalWallet + payer.fetch)
Gateway: 1 dynamic route (POST /gateway/:proxy/*)
Types: endpoint field is plain string (any proxy name)
Constants: CORBITS_URLS removed, replaced by proxy-resolver.ts with cache
Skill: Credit management only (setup/balance/topup/usage)
Discovery: corbits-skill handles /corbits search/list/call
Name: CorbitsClaw / @corbitsclaw/* / ~/.corbitsclaw/ / clawdmeter.vercel.app
```

---

## File-Level Change Map

### Files to MODIFY (rename + logic changes)

| File                               | Changes                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------- |
| `packages/shared/package.json`     | Rename @openclawd/shared -> @corbitsclaw/shared                                 |
| `packages/shared/src/types.ts`     | Remove CorbitsEndpoint union type, make endpoint a string                       |
| `packages/shared/src/constants.ts` | Remove CORBITS_URLS, keep other constants                                       |
| `apps/api/package.json`            | Rename @openclawd/api -> @corbitsclaw/api, swap deps                            |
| `apps/api/src/services/wallet.ts`  | Full rewrite with @faremeter/rides                                              |
| `apps/api/src/routes/gateway.ts`   | Replace 3 static routes with 1 dynamic route, remove debug routes, fix path bug |
| `apps/api/src/routes/admin.ts`     | Update CorbitsEndpoint import -> string type                                    |
| `apps/api/src/services/config.ts`  | Update import from @corbitsclaw/shared                                          |
| `apps/api/src/services/ledger.ts`  | Update import from @corbitsclaw/shared                                          |
| `apps/api/src/services/auth.ts`    | Update API key prefix from oc* -> cc*                                           |
| `apps/api/src/index.ts`            | Remove debug endpoints referencing old wallet                                   |
| `apps/api/tsconfig.json`           | Update if needed                                                                |
| `pnpm-workspace.yaml`              | Add @faremeter/rides to catalog, remove old packages                            |
| `Makefile`                         | Add build and test commands                                                     |
| `scripts/setup-db.ts`              | Remove CHECK constraint on transactions.endpoint                                |
| `CLAUDE.md`                        | Rename all references                                                           |
| `README.md`                        | Rename all references                                                           |
| `DEPLOYMENT.md`                    | Rename, remove RPC section, update API URL                                      |
| `vercel.json`                      | No changes needed                                                               |
| `eslint.config.ts`                 | No changes needed                                                               |

### Files to CREATE

| File                                      | Purpose                                           |
| ----------------------------------------- | ------------------------------------------------- |
| `apps/api/src/services/proxy-resolver.ts` | Corbits Discovery API client with in-memory cache |
| `.claude/skills/corbits/SKILL.md`         | Copy from corbits-skill/SKILL.md                  |
| `.claude/skills/corbits/VERSION`          | Copy from corbits-skill/VERSION                   |

### Files to DELETE

| File                                              | Reason                            |
| ------------------------------------------------- | --------------------------------- |
| `.claude/skills/openclawd/endpoints/xai.md`       | No longer embedding endpoint docs |
| `.claude/skills/openclawd/endpoints/openai.md`    | No longer embedding endpoint docs |
| `.claude/skills/openclawd/endpoints/crossmint.md` | No longer embedding endpoint docs |
| `apps/api/src/types/bs58.d.ts`                    | bs58 package being removed        |

### Files/Directories to RENAME (move)

| From                            | To                                |
| ------------------------------- | --------------------------------- |
| `.claude/skills/openclawd/`     | `.claude/skills/corbitsclaw/`     |
| `.claude/commands/openclawd.md` | `.claude/commands/corbitsclaw.md` |

---

## New Service: proxy-resolver.ts

```typescript
// apps/api/src/services/proxy-resolver.ts
//
// Resolves Corbits proxy names to URLs using the Discovery API.
// Caches results in memory with a 5-minute TTL.
//
// Discovery API: https://api.corbits.dev/api/v1/search?q=<name>
//
// Cache entry: { url: string, timestamp: number }
// Cache TTL: 5 minutes (300_000 ms)
//
// Exports:
//   resolveProxy(name: string): Promise<string>  -- returns proxy URL
//   clearProxyCache(): void                       -- clears cache (for admin use)
//
// Error cases:
//   - Proxy not found: throw Error("Unknown proxy: <name>")
//   - Discovery API unreachable: throw Error("Proxy resolution failed: <reason>")
```

---

## Wallet Service Rewrite: wallet.ts

### Current exports to preserve (interface compatibility)

```typescript
export interface X402RequestResult<T = unknown> {
  data: T;
  response: Response;
  costPaid: string;
}

export interface X402RequestOptions {
  allowZeroCost?: boolean;
}

export class X402CostMissingError extends Error { ... }

export function initWallet(): Promise<void>
export function isWalletInitialized(): boolean
export function makeX402Request<T>(endpoint, path, body?, method?, options?): Promise<X402RequestResult<T>>
```

### Removed exports

```typescript
// DELETE - dead code, never imported
export function getWalletBalance(): Promise<{ amount; decimals; rawAmount }>;
export function getWalletPublicKey(): string;
```

---

## Gateway Route Changes

### Current (3 static routes)

```typescript
gatewayRoutes.post('/xai/*', ...)
gatewayRoutes.post('/openai/*', ...)
gatewayRoutes.post('/amazon/*', ...)
```

### Target (1 dynamic route)

```typescript
gatewayRoutes.post('/:proxy/*', async (c) => {
  const proxy = c.req.param('proxy');
  const path = c.req.path.replace(`/gateway/${proxy}`, '') || '/';
  const proxyUrl = await resolveProxy(proxy);
  return handleGatewayRequest(c, proxy, proxyUrl, path);
});
```

### handleGatewayRequest signature change

```typescript
// Current: endpoint is CorbitsEndpoint, URL looked up from CORBITS_URLS
async function handleGatewayRequest(c, endpoint: CorbitsEndpoint, path: string);

// Target: proxyName is string, proxyUrl passed directly
async function handleGatewayRequest(
  c,
  proxyName: string,
  proxyUrl: string,
  path: string
);
```

---

## Shared Types Changes

### packages/shared/src/types.ts

```typescript
// REMOVE
export type CorbitsEndpoint = 'xai' | 'openai' | 'amazon';

// UPDATE Transaction interface
export interface Transaction {
  // endpoint changes from CorbitsEndpoint to string
  endpoint: string;
  // everything else stays the same
}

// UPDATE MarginConfig
export interface MarginConfig {
  global: number;
  perEndpoint: Record<string, number>; // was Partial<Record<CorbitsEndpoint, number>>
}
```

### packages/shared/src/constants.ts

```typescript
// REMOVE
export const CORBITS_URLS: Record<CorbitsEndpoint, string> = { ... };

// KEEP everything else
export const DEFAULT_MARGIN_PERCENT = 30;
export const STRIPE_FEE_PERCENT = 0.029;
export const STRIPE_FEE_FIXED = 0.3;
export const MIN_TOPUP_USD = 10;
export const LOW_BALANCE_THRESHOLD = 5;
export const MAGIC_LINK_EXPIRY_MINUTES = 15;
export const ADMIN_SESSION_EXPIRY_HOURS = 1;

// ADD
export const CORBITS_DISCOVERY_API = 'https://api.corbits.dev/api/v1';
export const PROXY_CACHE_TTL_MS = 300_000; // 5 minutes
```

---

## Database Schema Change

```sql
-- Remove hardcoded endpoint constraint
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_endpoint_check;
```

Update `scripts/setup-db.ts` to remove the CHECK constraint from the CREATE TABLE statement:

```sql
-- BEFORE
endpoint TEXT NOT NULL CHECK (endpoint IN ('xai', 'openai', 'amazon')),

-- AFTER
endpoint TEXT NOT NULL,
```

---

## Dependency Changes

### pnpm-workspace.yaml catalog

```yaml
# REMOVE
'@faremeter/fetch': '^0.15.0'
'@faremeter/wallet-solana': '^0.15.0'
'@faremeter/payment-solana': '^0.15.0'
'@solana/web3.js': '^1.98.0'
'@solana/spl-token': '^0.4.13'
'bs58': '^6.0.0'

# ADD
'@faremeter/rides': '^0.15.0'
```

### apps/api/package.json dependencies

```json
{
  "dependencies": {
    "@faremeter/rides": "catalog:",
    "@faremeter/types": "catalog:",
    "@hono/node-server": "catalog:",
    "@corbitsclaw/shared": "workspace:*",
    "@supabase/supabase-js": "catalog:",
    "bcryptjs": "catalog:",
    "hono": "catalog:",
    "stripe": "catalog:"
  }
}
```

---

## Rename Mapping

All string replacements across the codebase:

| Pattern           | Replacement             | Scope                    |
| ----------------- | ----------------------- | ------------------------ |
| `@openclawd/`     | `@corbitsclaw/`         | package.json, imports    |
| `OpenClawd`       | `CorbitsClaw`           | prose, comments, docs    |
| `openclawd`       | `corbitsclaw`           | paths, config, commands  |
| `OPENCLAWD`       | `CORBITSCLAW`           | env vars                 |
| `openclaw.ai`     | `clawdmeter.vercel.app` | URLs                     |
| `api.openclaw.ai` | `clawdmeter.vercel.app` | URLs                     |
| `oc_`             | `cc_`                   | API key prefix (auth.ts) |

---

## Build System Fixes

### Makefile

```makefile
build:
	pnpm -r build

test:
	pnpm -r test
```

### Formatting

Run `make format` after all changes to fix prettier issues.

---

## Implementation Phases

### Phase 1: Foundation (no dependencies)

- Rename all openclawd -> corbitsclaw (string replacement + directory moves)
- Fix Makefile build/test targets
- Install corbits-skill to .claude/skills/corbits/

### Phase 2: Backend refactor (depends on Phase 1)

- Rewrite wallet.ts with @faremeter/rides
- Create proxy-resolver.ts
- Rewrite gateway.ts (dynamic route, fix path bug, remove debug routes)
- Update shared types and constants
- Update pnpm-workspace.yaml catalog + package.json deps

### Phase 3: Skill refactor (depends on Phase 1)

- Rewrite corbitsclaw skill (credit management only)
- Rewrite corbitsclaw command router
- Remove embedded endpoint docs

### Phase 4: Docs + QA (depends on Phases 2, 3)

- Update DEPLOYMENT.md, README.md, CLAUDE.md
- Update database schema (setup-db.ts)
- Run make format + make to verify build
- Verify all tests pass
