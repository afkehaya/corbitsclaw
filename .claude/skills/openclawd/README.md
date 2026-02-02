# OpenClawd Skill for Claude Code

This skill provides Claude Code agents with access to AI APIs through the OpenClawd payment gateway.

## Overview

OpenClawd is a credit-based system that lets Claude Code access:
- **xAI/Grok**: Grok-4, Grok-3, Grok-2 chat completions
- **OpenAI**: GPT-4o, GPT-4-turbo, GPT-3.5-turbo
- **Crossmint/Amazon**: Purchase 1B+ Amazon products programmatically

Users deposit USD via credit card and their agent pays per-request automatically.

## Installation

### Method 1: Copy Files

Copy the skill files to your Claude Code configuration:

```bash
# Create directories if they don't exist
mkdir -p ~/.claude/skills/openclawd
mkdir -p ~/.claude/commands

# Copy skill files
cp -r .claude/skills/openclawd/* ~/.claude/skills/openclawd/
cp .claude/commands/openclawd.md ~/.claude/commands/
```

### Method 2: Symlink (Development)

For development, symlink to the repository:

```bash
ln -s /path/to/openclawd/.claude/skills/openclawd ~/.claude/skills/openclawd
ln -s /path/to/openclawd/.claude/commands/openclawd.md ~/.claude/commands/openclawd.md
```

### Verify Installation

Restart Claude Code and run:

```
/openclawd help
```

You should see the help message with available commands.

## First-Time Setup

### 1. Run Setup

```
/openclawd setup
```

### 2. Enter Your Email

The skill will prompt for your email address.

### 3. Check Your Email

Click the magic link sent to your email to authenticate.

### 4. Add Credits (Optional)

The setup flow will offer to open Stripe Checkout to add initial credits.

### 5. Start Using

Your API key is saved to `~/.openclawd/config.json` and you're ready to go!

## Command Reference

| Command | Description |
|---------|-------------|
| `/openclawd` | Show help and current balance |
| `/openclawd help` | Show detailed help |
| `/openclawd setup` | First-time setup wizard |
| `/openclawd login <email>` | Authenticate with a new email |
| `/openclawd balance` | Check credit balance in USD |
| `/openclawd topup [amount]` | Add credits (10, 25, 50, or 100) |
| `/openclawd usage [days]` | View transaction history |
| `/openclawd chat <model> <message>` | Quick chat with AI |
| `/openclawd xai <request>` | Direct xAI API call |
| `/openclawd openai <request>` | Direct OpenAI API call |
| `/openclawd amazon <request>` | Direct Amazon API call |

## Quick Chat

The `chat` command provides a simplified interface:

```
/openclawd chat grok "Explain quantum computing"
/openclawd chat gpt-4 "Write a haiku about programming"
/openclawd chat gpt-3.5 "What is 2+2?"
```

### Model Shortcuts

| Shortcut | Maps To |
|----------|---------|
| `grok`, `grok-4` | xAI grok-4 |
| `grok-3` | xAI grok-3 |
| `grok-2` | xAI grok-2 |
| `gpt-4`, `gpt-4o` | OpenAI gpt-4o |
| `gpt-4-turbo` | OpenAI gpt-4-turbo |
| `gpt-3.5` | OpenAI gpt-3.5-turbo |
| `o1` | OpenAI o1-preview |

## Direct API Calls

For full control, use the direct API endpoints:

### xAI/Grok

```
/openclawd xai {"model": "grok-4", "messages": [{"role": "user", "content": "Hello!"}]}
```

### OpenAI

```
/openclawd openai {"model": "gpt-4o", "messages": [{"role": "user", "content": "Hello!"}], "max_tokens": 100}
```

### Amazon/Crossmint

```
/openclawd amazon {"productLocator": "amazon:B01DFKC2SO", "quantity": 1, "shippingAddress": {...}}
```

## Configuration

### Config File Location

```
~/.openclawd/config.json
```

### Config Format

```json
{
  "apiKey": "oc_your_api_key_here",
  "email": "your@email.com"
}
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENCLAWD_API_URL` | API base URL | `https://api.openclawd.ai` |

Set a custom API URL for development:

```bash
export OPENCLAWD_API_URL=http://localhost:3000
```

## Skill Files

```
.claude/skills/openclawd/
+-- skill.md              # Main skill instructions
+-- README.md             # This file
+-- endpoints/
|   +-- xai.md            # xAI/Grok API documentation
|   +-- openai.md         # OpenAI API documentation
|   +-- crossmint.md      # Crossmint/Amazon API documentation
+-- templates/
    +-- skill.md          # Detailed implementation template
```

## Troubleshooting

### "Run /openclawd setup first"

The skill can't find your configuration. Run:
```
/openclawd setup
```

### "Insufficient balance"

Your credit balance is too low. Add more credits:
```
/openclawd topup 50
```

### "Invalid API key"

Your API key may have been rotated. Re-authenticate:
```
/openclawd login your@email.com
```

### "Unable to connect"

Check your internet connection and that the API is reachable:
```bash
curl https://api.openclawd.ai/health
```

### Magic Link Not Arriving

1. Check your spam folder
2. Verify the email address is correct
3. Try again with `/openclawd login <email>`

### Config File Issues

Reset your configuration:
```bash
rm ~/.openclawd/config.json
/openclawd setup
```

## API Response Headers

When making API calls, the response includes useful headers:

| Header | Description |
|--------|-------------|
| `X-Request-Id` | Unique request identifier for support |
| `X-Cost-Total` | Total cost deducted in USD |

## Pricing

Costs are based on:
1. **x402 Cost**: The actual cost charged by Corbits
2. **Margin**: Configured percentage (default 30%)
3. **Total**: x402 cost + margin

Example: If a request costs $0.001 from Corbits, you pay $0.0013 (30% margin).

View your usage breakdown:
```
/openclawd usage 7
```

## Security

- API keys are stored locally in `~/.openclawd/config.json`
- All API communication uses HTTPS
- Magic links expire after 15 minutes
- API keys can be rotated via `/openclawd login`

## Support

For issues:
1. Check the troubleshooting section above
2. Review the [main documentation](../../../README.md)
3. Check the [deployment guide](../../../DEPLOYMENT.md)
4. Open an issue on GitHub

## Updates

To update the skill:

```bash
# If using copied files
cp -r /path/to/new/openclawd/.claude/skills/openclawd/* ~/.claude/skills/openclawd/
cp /path/to/new/openclawd/.claude/commands/openclawd.md ~/.claude/commands/

# If using symlinks
cd /path/to/openclawd
git pull
```

Restart Claude Code to load the updated skill.
