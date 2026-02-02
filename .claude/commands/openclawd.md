# OpenClawd - Agentic Commerce for Claude Code

Load the full skill from `.claude/skills/openclawd/skill.md` and execute based on the argument provided.

**Arguments:** $ARGUMENTS

## Command Routing

Parse $ARGUMENTS to determine which command to run:

| Argument | Action |
|----------|--------|
| (empty) or "help" | Show available commands and current balance |
| "setup" | Run setup flow (email auth + initial credit purchase) |
| "balance" | Show current credit balance in USD |
| "topup [amount]" | Add credits (opens Stripe checkout, default $10, min $10) |
| "usage [days]" | Show usage history (default 30 days) |
| "xai <request>" | Call xAI/Grok API |
| "openai <request>" | Call OpenAI API |
| "amazon <request>" | Call Crossmint/Amazon API |

## Quick Reference

```
/openclawd              # Show help and balance
/openclawd setup        # First-time setup (email + credits)
/openclawd balance      # Check balance
/openclawd topup 50     # Add $50 credits
/openclawd usage        # View recent usage
/openclawd xai {"model": "grok-4", "messages": [...]}
/openclawd openai {"model": "gpt-4o", "messages": [...]}
/openclawd amazon {"productLocator": "amazon:B01DFKC2SO", ...}
```

## Execution

Read `.claude/skills/openclawd/skill.md` for detailed instructions on each command.

For API calls (xai, openai, amazon), also read the endpoint-specific documentation:
- `.claude/skills/openclawd/endpoints/xai.md`
- `.claude/skills/openclawd/endpoints/openai.md`
- `.claude/skills/openclawd/endpoints/crossmint.md`
