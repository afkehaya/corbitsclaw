# OpenClawd

Agentic commerce for Claude Code. Access AI APIs (xAI/Grok, OpenAI, Crossmint/Amazon) using a simple credit-based payment system.

## Overview

OpenClawd is a Claude Code skill that provides instant access to powerful AI APIs through Corbits endpoints. Users deposit dollars via credit card, maintain a USD balance, and their Claude agent pays per-request automatically. A hosted Solana wallet handles all crypto complexity using the x402 micropayment protocol.

### Key Features

- **Instant API Access**: Call xAI/Grok, OpenAI, and Crossmint/Amazon APIs without managing API keys
- **Credit-Based Billing**: Simple USD credits with transparent pricing
- **Magic Link Auth**: Passwordless authentication via email
- **Stripe Payments**: Secure credit card purchases via Stripe Checkout
- **x402 Protocol**: Automatic micropayments to Corbits via Solana USDC
- **Admin Dashboard**: Configure margins, view metrics, manage users

## Architecture

```
+-------------------------+
|    Claude Code CLI      |
|   /openclawd commands   |
+------------+------------+
             |
             | HTTPS (Bearer token)
             v
+-------------------------+     +------------------+
|    OpenClawd API        |     |    Supabase      |
|    (Vercel Edge)        +---->+    PostgreSQL    |
|                         |     |                  |
| - Auth (magic link)     |     | - users          |
| - Credits (balance)     |     | - credits        |
| - Stripe (checkout)     |     | - transactions   |
| - Gateway (proxy)       |     | - magic_links    |
| - Admin (dashboard)     |     +------------------+
+------------+------------+
             |
             | x402 Protocol (USDC)
             v
+-------------------------+
|    Corbits Network      |
|                         |
| - xAI (Grok)            |
| - OpenAI (GPT-4)        |
| - Crossmint (Amazon)    |
+-------------------------+
```

## Quick Start

### 1. Install the Skill

Copy the skill files to your Claude Code configuration:

```bash
cp -r .claude/skills/openclawd ~/.claude/skills/
cp .claude/commands/openclawd.md ~/.claude/commands/
```

### 2. Setup Your Account

```bash
/openclawd setup
```

This will:
1. Prompt for your email address
2. Send a magic link for authentication
3. Save your API key locally
4. Optionally open Stripe to purchase initial credits

### 3. Start Using APIs

```bash
# Check your balance
/openclawd balance

# Quick chat with AI models
/openclawd chat grok "Explain quantum computing"
/openclawd chat gpt-4 "Write a haiku about code"

# Add more credits when needed
/openclawd topup 50
```

## Prerequisites

- **Node.js**: v20 or later
- **pnpm**: v10.12.1 or later
- **Supabase**: Account and project
- **Stripe**: Account with API keys
- **Solana Wallet**: Funded with USDC for x402 payments
- **Resend**: Account for magic link emails

## Installation

### Clone and Install

```bash
git clone https://github.com/your-org/openclawd.git
cd openclawd
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
pnpm --filter @openclawd/api dev

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
openclawd/
+-- .claude/
|   +-- commands/
|   |   +-- openclawd.md         # Slash command router
|   +-- skills/
|       +-- openclawd/
|           +-- skill.md          # Main skill logic
|           +-- endpoints/        # Embedded API docs
|               +-- xai.md
|               +-- openai.md
|               +-- crossmint.md
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

| Provider | Endpoint | Description |
|----------|----------|-------------|
| xAI | `POST /gateway/xai/*` | Grok-4, Grok-3, Grok-2 chat completions |
| OpenAI | `POST /gateway/openai/*` | GPT-4o, GPT-4-turbo, GPT-3.5-turbo |
| Amazon | `POST /gateway/amazon/*` | Crossmint headless checkout for 1B+ products |

## Skill Commands

| Command | Description |
|---------|-------------|
| `/openclawd` | Show help and current balance |
| `/openclawd setup` | First-time setup (email auth + credits) |
| `/openclawd login <email>` | Authenticate with magic link |
| `/openclawd balance` | Check credit balance in USD |
| `/openclawd topup [amount]` | Add credits ($10, $25, $50, $100) |
| `/openclawd usage [days]` | View transaction history |
| `/openclawd chat <model> <msg>` | Quick chat interface |
| `/openclawd xai <request>` | Direct xAI API call |
| `/openclawd openai <request>` | Direct OpenAI API call |
| `/openclawd amazon <request>` | Direct Amazon API call |

## Payment Flow

1. **Purchase Credits**: User buys $50 via Stripe Checkout
2. **Stripe Processes**: Charges card, deducts fees (~2.9% + $0.30)
3. **Credits Added**: $50 added to user's ledger balance
4. **API Request**: User's agent calls `/gateway/openai/v1/chat/completions`
5. **x402 Payment**: Backend pays Corbits via Solana USDC
6. **Cost Deducted**: x402 cost + configured margin deducted from balance
7. **Response**: API response returned to agent

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
- [Skill Documentation](./.claude/skills/openclawd/README.md)
- [Corbits Documentation](https://docs.corbits.dev/)
- [x402 Protocol](https://docs.corbits.dev/llms.txt)
