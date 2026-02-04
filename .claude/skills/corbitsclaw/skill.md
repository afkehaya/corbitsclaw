# CorbitsClaw Skill

Credit management for Claude Code. Manage your CorbitsClaw account: register, authenticate, check balance, add credits, and view usage history.

> **Looking for API access?** Use the `/corbits` skill for API discovery and endpoint calls. CorbitsClaw handles credits only.

## Two-Skill Architecture

CorbitsClaw is split into two complementary skills:

| Skill          | Purpose                                          |
| -------------- | ------------------------------------------------ |
| `/corbitsclaw` | Credit management (setup, balance, topup, usage) |
| `/corbits`     | API discovery and endpoint calls (search, call)  |

You need credits (managed here) before you can use APIs (via `/corbits`).

## Quick Start

```
/corbitsclaw setup    # First-time setup (register + get API key)
/corbitsclaw balance  # Check credit balance
/corbitsclaw topup 25 # Add $25 in credits
/corbitsclaw usage    # View recent usage history
```

## Configuration

Local config stored at: `~/.corbitsclaw/config.json`

```json
{
  "apiKey": "cc_...",
  "email": "user@example.com"
}
```

API Base URL: `CORBITSCLAW_API_URL` environment variable or `https://clawdmeter.vercel.app`

## Commands

| Command                               | Description                             |
| ------------------------------------- | --------------------------------------- |
| `/corbitsclaw` or `/corbitsclaw help` | Show available commands and status      |
| `/corbitsclaw setup`                  | First-time setup (email auth + API key) |
| `/corbitsclaw login <email>`          | Authenticate with magic link            |
| `/corbitsclaw balance`                | Check credit balance in USD             |
| `/corbitsclaw topup [amount]`         | Add credits ($10, $25, $50, $100)       |
| `/corbitsclaw usage [days]`           | View transaction history                |

## Command Details

### help

**Trigger**: `/corbitsclaw` or `/corbitsclaw help`

Display available commands and current status.

1. Read config to check if user is authenticated
2. If authenticated, fetch and display balance
3. Show command reference

Output format:

```
CorbitsClaw - Credit Management for Claude Code
================================================

Status: [Authenticated as user@example.com | Not authenticated]
Balance: [$XX.XX USD | Run /corbitsclaw setup to get started]

Credit Commands:
  /corbitsclaw setup              First-time setup (authenticate + get API key)
  /corbitsclaw login <email>      Authenticate with your email
  /corbitsclaw balance            Check your credit balance
  /corbitsclaw topup [amount]     Add credits ($10, $25, $50, or $100)
  /corbitsclaw usage [days]       View usage history (default: 30 days)

API Access:
  Use /corbits search <query>     Discover available APIs
  Use /corbits call <endpoint>    Call an API endpoint
```

### setup

**Trigger**: `/corbitsclaw setup`

First-time setup flow for new users.

1. Check if already configured (`~/.corbitsclaw/config.json`)
2. If configured, ask if user wants to reconfigure
3. Prompt user for email address
4. Send magic link via `POST /auth/send-link`
5. User clicks link, gets API key
6. Save API key to `~/.corbitsclaw/config.json`
7. Optionally create checkout for initial credits

```bash
API_URL="${CORBITSCLAW_API_URL:-https://clawdmeter.vercel.app}"
curl -s -X POST "${API_URL}/auth/send-link" \
  -H "Content-Type: application/json" \
  -d '{"email": "USER_EMAIL_HERE"}'
```

After user provides API key, verify it works:

```bash
curl -s -X GET "${API_URL}/credits/balance" \
  -H "Authorization: Bearer ${API_KEY}"
```

Save config:

```bash
mkdir -p ~/.corbitsclaw
cat > ~/.corbitsclaw/config.json << 'EOF'
{
  "apiKey": "API_KEY_HERE",
  "email": "USER_EMAIL_HERE"
}
EOF
chmod 600 ~/.corbitsclaw/config.json
```

### login

**Trigger**: `/corbitsclaw login <email>` or `/corbitsclaw login`

Authenticate user via magic link.

1. Get email (from argument or prompt)
2. Validate email format
3. Send magic link: `POST /auth/send-link`
4. Instruct user to check email and click link
5. User pastes API key (starts with `cc_`)
6. Verify key via `GET /credits/balance`
7. Save to `~/.corbitsclaw/config.json`

### balance

**Trigger**: `/corbitsclaw balance`

Check current credit balance.

1. Read config from `~/.corbitsclaw/config.json`
2. Fetch balance: `GET /credits/balance` with `Authorization: Bearer cc_...`
3. Display balance in USD

### topup

**Trigger**: `/corbitsclaw topup [amount]` or `/corbitsclaw buy [amount]`

Add credits via Stripe checkout.

Valid amounts: $10, $25, $50, $100

1. Validate amount (prompt if not provided)
2. Read config
3. Create checkout: `POST /stripe/checkout` with `{"amount": N, "returnUrl": "https://clawdmeter.vercel.app/checkout/success"}`
4. Display Stripe checkout URL for user

### usage

**Trigger**: `/corbitsclaw usage [days]`

View usage history and transaction log.

Default: 30 days. Maximum: 365 days.

1. Read config
2. Fetch usage: `GET /credits/usage?days=N` with auth header
3. Display transactions as a formatted table

## API Endpoints (Credit Management Only)

| Operation         | Method | Endpoint               |
| ----------------- | ------ | ---------------------- |
| Send magic link   | POST   | /auth/send-link        |
| Verify magic link | GET    | /auth/verify?token=XXX |
| Refresh API key   | POST   | /auth/refresh          |
| Check balance     | GET    | /credits/balance       |
| View usage        | GET    | /credits/usage?days=N  |
| Create checkout   | POST   | /stripe/checkout       |
| Session status    | GET    | /stripe/session/:id    |

## Authentication

All authenticated endpoints require:

```
Authorization: Bearer cc_your_api_key
```

## Error Handling

| Scenario             | User Message                                            |
| -------------------- | ------------------------------------------------------- |
| Missing config       | "Run /corbitsclaw setup first"                          |
| Insufficient balance | "Insufficient balance. Add credits: /corbitsclaw topup" |
| Invalid API key      | "Your API key is invalid. Run /corbitsclaw login"       |
| Rate limited         | "Rate limited. Please wait and try again."              |
| Network error        | "Unable to connect. Please try again."                  |

## Best Practices

1. **Always read config first** - Check `~/.corbitsclaw/config.json` exists before making authenticated requests
2. **Handle errors gracefully** - Parse error responses and provide actionable suggestions
3. **Format output nicely** - Use tables, headers, and clear formatting
4. **Mask sensitive data** - Show only the last 4 characters of API keys in output
5. **Point users to /corbits** - For any API discovery or endpoint usage questions, direct users to the `/corbits` skill
