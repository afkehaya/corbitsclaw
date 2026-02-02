# OpenClawd Skill

Agentic commerce for Claude Code. Access AI APIs (xAI/Grok, OpenAI, Crossmint/Amazon) using a credit-based payment system.

## Quick Start

```
/openclawd setup    # First-time setup
/openclawd balance  # Check credits
/openclawd chat grok "Hello world"  # Quick chat
```

## Configuration

Local config stored at: `~/.openclawd/config.json`
```json
{
  "apiKey": "oc_...",
  "email": "user@example.com"
}
```

API Base URL: `OPENCLAWD_API_URL` environment variable or `https://api.openclawd.ai`

## Commands Overview

| Command | Description |
|---------|-------------|
| `/openclawd` or `/openclawd help` | Show available commands and status |
| `/openclawd setup` | First-time setup (auth + initial credits) |
| `/openclawd login <email>` | Authenticate with magic link |
| `/openclawd balance` | Check credit balance |
| `/openclawd topup [amount]` | Add credits ($10, $25, $50, $100) |
| `/openclawd usage [days]` | View transaction history |
| `/openclawd xai <request>` | Call xAI/Grok API |
| `/openclawd openai <request>` | Call OpenAI API |
| `/openclawd amazon <request>` | Call Crossmint/Amazon API |
| `/openclawd chat <model> <message>` | Quick chat interface |

## Detailed Implementation

For detailed command implementations and API call examples, see:
- **Main template**: `.claude/skills/openclawd/templates/skill.md`

For endpoint-specific documentation:
- **xAI/Grok**: `.claude/skills/openclawd/endpoints/xai.md`
- **OpenAI**: `.claude/skills/openclawd/endpoints/openai.md`
- **Crossmint/Amazon**: `.claude/skills/openclawd/endpoints/crossmint.md`

## API Endpoints

The OpenClawd API provides these routes:

### Authentication
- `POST /auth/send-link` - Send magic link email
- `GET /auth/verify?token=XXX` - Verify magic link
- `POST /auth/refresh` - Refresh API key (requires auth)

### Credits
- `GET /credits/balance` - Get user balance (requires auth)
- `GET /credits/usage?days=N` - Get usage history (requires auth)

### Stripe
- `POST /stripe/checkout` - Create checkout session (requires auth)
- `GET /stripe/session/:id` - Get session status (requires auth)

### Gateway (AI APIs)
- `POST /gateway/xai/*` - Proxy to xAI (requires auth)
- `POST /gateway/openai/*` - Proxy to OpenAI (requires auth)
- `POST /gateway/amazon/*` - Proxy to Crossmint/Amazon (requires auth)

## Authentication

All authenticated endpoints require:
```
Authorization: Bearer oc_your_api_key
```

## Error Handling

| Scenario | User Message |
|----------|--------------|
| Missing config | "Run /openclawd setup first" |
| Insufficient balance | "Insufficient balance. Add credits: /openclawd topup" |
| Invalid API key | "Your API key is invalid. Run /openclawd login" |
| Rate limited | "Rate limited. Please wait and try again." |
| Network error | "Unable to connect. Please try again." |

## Chat Model Mapping

The `/openclawd chat <model> <message>` command supports these shortcuts:

| User Input | Endpoint | Model ID |
|------------|----------|----------|
| grok, grok-4 | xai | grok-4 |
| grok-3 | xai | grok-3 |
| gpt-4, gpt4o, gpt-4o | openai | gpt-4o |
| gpt-3.5, gpt35 | openai | gpt-3.5-turbo |
| o1 | openai | o1-preview |

## Example Flows

### Setup Flow
1. User runs `/openclawd setup`
2. Prompt for email
3. Send magic link via `POST /auth/send-link`
4. User clicks link, gets API key
5. Save API key to `~/.openclawd/config.json`
6. Optional: create checkout for initial credits

### API Call Flow
1. Read API key from config
2. Check balance via `GET /credits/balance`
3. Make request to gateway endpoint
4. Display response with cost from `X-Cost-Total` header
5. If 402 error, show balance and suggest topup
