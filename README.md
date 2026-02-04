# CorbitsClaw

Agentic commerce for Claude Code. Access AI APIs through Corbits endpoints using a simple credit-based payment system.

## Overview

CorbitsClaw is a Claude Code skill that provides instant access to powerful AI APIs through Corbits endpoints. Users deposit dollars via credit card, maintain a USD balance, and their Claude agent pays per-request automatically. A hosted Solana wallet handles all crypto complexity using the x402 micropayment protocol and `@faremeter/rides`.

### Key Features

- **Dynamic Proxy Gateway**: Automatically resolves and proxies to any Corbits endpoint
- **Credit-Based Billing**: Simple USD credits with transparent pricing
- **Magic Link Auth**: Passwordless authentication via email
- **Stripe Payments**: Secure credit card purchases via Stripe Checkout
- **x402 Protocol**: Automatic micropayments to Corbits via Solana USDC (powered by `@faremeter/rides`)
- **Endpoint Discovery**: Use `/corbits` to browse available API endpoints
- **Admin Dashboard**: Configure margins, view metrics, manage users

## Architecture

```
+-------------------------+
|    Claude Code CLI      |
|  /corbitsclaw commands  |
+------------+------------+
             |
             | HTTPS (Bearer token)
             v
+-------------------------+     +------------------+
|   CorbitsClaw API       |     |    Supabase      |
|   (Vercel Edge)         +---->+    PostgreSQL    |
|                         |     |                  |
| - Auth (magic link)     |     | - users          |
| - Credits (balance)     |     | - credits        |
| - Stripe (checkout)     |     | - transactions   |
| - Gateway (dynamic      |     | - magic_links    |
|   proxy resolution)     |     +------------------+
| - Admin (dashboard)     |
+------------+------------+
             |
             | x402 via @faremeter/rides
             v
+-------------------------+
|    Corbits Network      |
|  (dynamically resolved) |
|                         |
|  Any x402-enabled       |
|  Corbits endpoint       |
+-------------------------+
```

## Quick Start

### 1. Install the Skill

Copy the skill files to your Claude Code configuration:

```bash
cp -r .claude/skills/corbitsclaw ~/.claude/skills/
cp .claude/commands/corbitsclaw.md ~/.claude/commands/
```

### 2. Setup Your Account

```bash
/corbitsclaw setup
```

This will:

1. Prompt for your email address
2. Send a magic link for authentication
3. Save your API key locally
4. Optionally open Stripe to purchase initial credits

### 3. Start Using APIs

```bash
# Check your balance
/corbitsclaw balance

# Discover available endpoints
/corbits

# Quick chat with AI models
/corbitsclaw chat grok "Explain quantum computing"

# Add more credits when needed
/corbitsclaw topup 50
```

## Prerequisites

- **Node.js**: v20 or later
- **pnpm**: v10.12.1 or later
- **Supabase**: Account and project
- **Stripe**: Account with API keys
- **Solana Wallet**: Funded with USDC for x402 payments (managed via `@faremeter/rides`)
- **Resend**: Account for magic link emails

## Installation

### Clone and Install

```bash
git clone https://github.com/your-org/corbitsclaw.git
cd corbitsclaw
pnpm install
```

### Configure Environment

Create `.env` files for the API:

```bash
cp apps/api/.env.example apps/api/.env
```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for complete environment variable reference.

### Run Locally

```bash
# Start the API server
pnpm --filter @corbitsclaw/api dev

# The API runs at http://localhost:3000
```

### Build and Test

```bash
# Run full build pipeline
make

# Individual commands
make lint    # Run ESLint and Prettier
make build   # Compile TypeScript
make test    # Run tests
make format  # Auto-fix formatting
```

## Project Structure

```
corbitsclaw/
+-- .claude/
|   +-- commands/
|   |   +-- corbitsclaw.md         # Slash command router
|   +-- skills/
|       +-- corbitsclaw/
|           +-- skill.md          # Main skill logic
|           +-- endpoints/        # Embedded API docs (dynamic)
+-- apps/
|   +-- api/                      # Hono API (Vercel Edge)
|       +-- src/
|       |   +-- index.ts          # App entry point
|       |   +-- routes/           # API routes
|       |   +-- services/         # Business logic
|       |   +-- middleware/       # Auth middleware
|       |   +-- lib/              # Utilities
|       +-- vercel.json           # Vercel config
+-- packages/
|   +-- shared/                   # Shared types/constants
|       +-- src/
|           +-- types.ts
|           +-- constants.ts
+-- scripts/
|   +-- setup-db.ts              # DB migration script
+-- docs/
|   +-- PRD.md                   # Product requirements
|   +-- TECHNICAL.md             # Technical specification
+-- DEPLOYMENT.md                 # Deployment guide
+-- Makefile                      # Build commands
+-- pnpm-workspace.yaml           # Monorepo config
+-- tsconfig.base.json            # Base TS config
```

## Supported APIs

The gateway uses dynamic proxy resolution to forward requests to any available Corbits endpoint. Use `/corbits` to discover currently available endpoints and their capabilities.

| Route                       | Description                                          |
| --------------------------- | ---------------------------------------------------- |
| `POST /gateway/:endpoint/*` | Proxy to any Corbits endpoint via dynamic resolution |

Endpoints are resolved at request time using `@faremeter/rides`, so new Corbits endpoints become available automatically without code changes.

## Skill Commands

| Command                           | Description                             |
| --------------------------------- | --------------------------------------- |
| `/corbitsclaw`                    | Show help and current balance           |
| `/corbitsclaw setup`              | First-time setup (email auth + credits) |
| `/corbitsclaw login <email>`      | Authenticate with magic link            |
| `/corbitsclaw balance`            | Check credit balance in USD             |
| `/corbitsclaw topup [amount]`     | Add credits ($10, $25, $50, $100)       |
| `/corbitsclaw usage [days]`       | View transaction history                |
| `/corbitsclaw chat <model> <msg>` | Quick chat interface                    |
| `/corbits`                        | Discover available Corbits endpoints    |

## Payment Flow

1. **Purchase Credits**: User buys $50 via Stripe Checkout
2. **Stripe Processes**: Charges card, deducts fees (~2.9% + $0.30)
3. **Credits Added**: $50 added to user's ledger balance
4. **API Request**: User's agent calls `/gateway/:endpoint/...`
5. **Dynamic Resolution**: Gateway resolves the endpoint via `@faremeter/rides`
6. **x402 Payment**: Backend pays Corbits via Solana USDC
7. **Cost Deducted**: x402 cost + configured margin deducted from balance
8. **Response**: API response returned to agent

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Follow the [faremeter conventions](./CONVENTIONS.md)
4. Run `make` to ensure all checks pass
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Development Guidelines

- Use pnpm with `catalog:` version specifiers
- Follow strict TypeScript configuration
- Write tests with `tap` (node-tap)
- Run `make format` before committing
- Keep packages scoped to their directories

## License

MIT License - see [LICENSE](./LICENSE) for details.

## Links

- [Deployment Guide](./DEPLOYMENT.md)
- [API Documentation](./apps/api/README.md)
- [Skill Documentation](./.claude/skills/corbitsclaw/README.md)
- [Corbits Documentation](https://docs.corbits.dev/)
- [x402 Protocol](https://docs.corbits.dev/llms.txt)
