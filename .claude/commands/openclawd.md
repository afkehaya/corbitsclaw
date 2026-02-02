# OpenClawd - Agentic Commerce for Claude Code

Load the full skill from `.claude/skills/openclawd/skill.md` and execute based on the argument provided.

**Arguments:** $ARGUMENTS

## Command Routing

Parse $ARGUMENTS to determine which command to run:

| Argument | Action |
|----------|--------|
| (empty) or "help" | Show available commands and current balance |
| "setup" | Run setup flow (email auth + initial credit purchase) |
| "login [email]" | Authenticate with magic link |
| "balance" | Show current credit balance in USD |
| "topup [amount]" or "buy [amount]" | Add credits (opens Stripe checkout) |
| "usage [days]" | Show usage history (default 30 days) |
| "xai <request>" | Call xAI/Grok API |
| "openai <request>" | Call OpenAI API |
| "amazon <request>" | Call Crossmint/Amazon API |
| "chat <model> <message>" | Quick chat with AI models |

## Quick Reference

```
/openclawd              # Show help and balance
/openclawd setup        # First-time setup (email + credits)
/openclawd login        # Authenticate with email
/openclawd balance      # Check balance
/openclawd topup 50     # Add $50 credits
/openclawd usage        # View recent usage
/openclawd chat grok "Hello!"   # Quick chat with Grok
/openclawd chat gpt-4 "Hi!"     # Quick chat with GPT-4
/openclawd xai {"model": "grok-4", "messages": [...]}
/openclawd openai {"model": "gpt-4o", "messages": [...]}
/openclawd amazon {"productLocator": "amazon:B01DFKC2SO", ...}
```

## Execution

Read the skill documentation in this order:

1. **Main skill overview**: `.claude/skills/openclawd/skill.md`
2. **Detailed implementation**: `.claude/skills/openclawd/templates/skill.md`

For API calls (xai, openai, amazon), also read the endpoint-specific documentation:
- `.claude/skills/openclawd/endpoints/xai.md`
- `.claude/skills/openclawd/endpoints/openai.md`
- `.claude/skills/openclawd/endpoints/crossmint.md`

## Configuration

Config file: `~/.openclawd/config.json`
API Base URL: `OPENCLAWD_API_URL` env var or `https://api.openclawd.ai`

## Model Shortcuts for Chat

| Shortcut | Maps To |
|----------|---------|
| grok, grok-4 | xai / grok-4 |
| grok-3 | xai / grok-3 |
| gpt-4, gpt-4o | openai / gpt-4o |
| gpt-3.5 | openai / gpt-3.5-turbo |
| o1 | openai / o1-preview |
