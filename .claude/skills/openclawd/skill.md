# OpenClawd Skill

This skill provides access to Corbits-hosted APIs (xAI, OpenAI, Crossmint/Amazon) using a simple credit system.

## Configuration

Local config stored at: `~/.openclawd/config.json`
```json
{
  "apiKey": "oc_...",
  "email": "user@example.com",
  "apiBaseUrl": "https://api.openclawd.ai"
}
```

## Commands

[Detailed command implementations will be added in task #11]

### Setup Command
- Check if ~/.openclawd/config.json exists
- If not, prompt for email and run auth flow
- Guide user through initial credit purchase

### Balance Command
- Read API key from config
- Call GET /balance endpoint
- Display balance in USD

### Topup Command
- Accept optional amount argument (default $10, minimum $10)
- Call POST /topup endpoint
- Open returned Stripe checkout URL in browser

### Usage Command
- Accept optional days argument (default 30)
- Call GET /usage endpoint
- Display transaction history with cost breakdown

### API Call Commands (xai, openai, amazon)
- Validate config exists
- Parse JSON request body from argument
- Call POST /api/{endpoint}/*
- Display response (or error if insufficient balance)

## Error Handling

- Missing config -> "Run /openclawd setup first"
- Insufficient balance -> Show balance and prompt for topup
- Invalid API key -> "Your API key is invalid. Run /openclawd setup to re-authenticate"
- Network error -> Display error message
