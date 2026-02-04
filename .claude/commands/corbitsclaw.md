# CorbitsClaw - Credit Management for Claude Code

Load the full skill from `.claude/skills/corbitsclaw/skill.md` and execute based on the argument provided.

**Arguments:** $ARGUMENTS

## Command Routing

Parse $ARGUMENTS to determine which command to run:

| Argument                           | Action                                |
| ---------------------------------- | ------------------------------------- |
| (empty) or "help"                  | Show available commands and balance   |
| "setup"                            | Run setup flow (email auth + API key) |
| "login [email]"                    | Authenticate with magic link          |
| "balance"                          | Show current credit balance in USD    |
| "topup [amount]" or "buy [amount]" | Add credits (opens Stripe checkout)   |
| "usage [days]"                     | Show usage history (default 30 days)  |

> **Looking for API access?** Use `/corbits search <query>` to discover available APIs and `/corbits call <endpoint>` to make API calls.

## Quick Reference

```
/corbitsclaw              # Show help and balance
/corbitsclaw setup        # First-time setup (email + API key)
/corbitsclaw login        # Authenticate with email
/corbitsclaw balance      # Check balance
/corbitsclaw topup 50     # Add $50 credits
/corbitsclaw usage        # View recent usage
```

## Execution

Read the skill documentation:

1. **Skill overview and command details**: `.claude/skills/corbitsclaw/skill.md`

## Configuration

Config file: `~/.corbitsclaw/config.json`
API Base URL: `CORBITSCLAW_API_URL` env var or `https://clawdmeter.vercel.app`
