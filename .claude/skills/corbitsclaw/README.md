# CorbitsClaw Skill for Claude Code

This skill provides Claude Code agents with credit management capabilities for the CorbitsClaw platform.

## Overview

CorbitsClaw is a credit-based system that lets Claude Code agents manage their account and credits. Users deposit USD via credit card and their credits are consumed when making API calls through the platform.

## Two-Skill Architecture

CorbitsClaw uses a two-skill design to separate concerns:

| Skill          | Scope                   | Command Examples                    |
| -------------- | ----------------------- | ----------------------------------- |
| `/corbitsclaw` | **Credit management**   | setup, login, balance, topup, usage |
| `/corbits`     | **API discovery/calls** | search, call                        |

**Why two skills?**

- `/corbitsclaw` handles everything related to your account and credits: registration, authentication, checking balance, adding funds, and reviewing usage history.
- `/corbits` handles API discovery and making API calls. It is installed separately at `.claude/skills/corbits/`.
- This separation keeps each skill focused and makes it easy to update API capabilities independently of credit management.

## Installation

### Method 1: Copy Files

Copy the skill files to your Claude Code configuration:

```bash
mkdir -p ~/.claude/skills/corbitsclaw
mkdir -p ~/.claude/commands

cp -r .claude/skills/corbitsclaw/* ~/.claude/skills/corbitsclaw/
cp .claude/commands/corbitsclaw.md ~/.claude/commands/
```

### Method 2: Symlink (Development)

For development, symlink to the repository:

```bash
ln -s /path/to/corbitsclaw/.claude/skills/corbitsclaw ~/.claude/skills/corbitsclaw
ln -s /path/to/corbitsclaw/.claude/commands/corbitsclaw.md ~/.claude/commands/corbitsclaw.md
```

### Verify Installation

Restart Claude Code and run:

```
/corbitsclaw help
```

You should see the help message with available commands.

## First-Time Setup

### 1. Run Setup

```
/corbitsclaw setup
```

### 2. Enter Your Email

The skill will prompt for your email address.

### 3. Check Your Email

Click the magic link sent to your email to authenticate.

### 4. Add Credits (Optional)

The setup flow will offer to open Stripe Checkout to add initial credits.

### 5. Start Using

Your API key is saved to `~/.corbitsclaw/config.json` and you are ready to go. Use `/corbits` to discover and call APIs.

## Command Reference

| Command                       | Description                      |
| ----------------------------- | -------------------------------- |
| `/corbitsclaw`                | Show help and current balance    |
| `/corbitsclaw help`           | Show detailed help               |
| `/corbitsclaw setup`          | First-time setup wizard          |
| `/corbitsclaw login <email>`  | Authenticate with a new email    |
| `/corbitsclaw balance`        | Check credit balance in USD      |
| `/corbitsclaw topup [amount]` | Add credits (10, 25, 50, or 100) |
| `/corbitsclaw usage [days]`   | View transaction history         |

## Configuration

### Config File Location

```
~/.corbitsclaw/config.json
```

### Config Format

```json
{
  "apiKey": "cc_your_api_key_here",
  "email": "your@email.com"
}
```

### Environment Variables

| Variable              | Description  | Default                         |
| --------------------- | ------------ | ------------------------------- |
| `CORBITSCLAW_API_URL` | API base URL | `https://clawdmeter.vercel.app` |

Set a custom API URL for development:

```bash
export CORBITSCLAW_API_URL=http://localhost:3000
```

## Skill Files

```
.claude/skills/corbitsclaw/
+-- skill.md              # Main skill instructions
+-- README.md             # This file
```

## Troubleshooting

### "Run /corbitsclaw setup first"

The skill cannot find your configuration. Run:

```
/corbitsclaw setup
```

### "Insufficient balance"

Your credit balance is too low. Add more credits:

```
/corbitsclaw topup 50
```

### "Invalid API key"

Your API key may have been rotated. Re-authenticate:

```
/corbitsclaw login your@email.com
```

### "Unable to connect"

Check your internet connection and that the API is reachable:

```bash
curl https://clawdmeter.vercel.app/health
```

### Magic Link Not Arriving

1. Check your spam folder
2. Verify the email address is correct
3. Try again with `/corbitsclaw login <email>`

### Config File Issues

Reset your configuration:

```bash
rm ~/.corbitsclaw/config.json
/corbitsclaw setup
```

## Pricing

Costs are based on the x402 cost charged by Corbits plus a configured margin. View your usage breakdown:

```
/corbitsclaw usage 7
```

## Security

- API keys are stored locally in `~/.corbitsclaw/config.json`
- All API communication uses HTTPS
- Magic links expire after 15 minutes
- API keys can be rotated via `/corbitsclaw login`

## Support

For issues:

1. Check the troubleshooting section above
2. Review the [main documentation](../../../README.md)
3. Check the [deployment guide](../../../DEPLOYMENT.md)
4. Open an issue on GitHub
