# OpenClawd Skill Template

This template provides Claude Code with instructions to execute OpenClawd commands. OpenClawd is an agentic commerce platform that provides access to AI APIs (xAI/Grok, OpenAI, Crossmint/Amazon) using a credit-based payment system.

---

## Configuration

### Storage Locations

- **Config file**: `~/.openclawd/config.json`
- **API Base URL**: Use `OPENCLAWD_API_URL` environment variable or default to `https://api.openclawd.ai`

### Config File Format

```json
{
  "apiKey": "oc_...",
  "email": "user@example.com"
}
```

### Reading Configuration

Before executing any authenticated command, read the config file:

```bash
cat ~/.openclawd/config.json 2>/dev/null
```

If the file does not exist or is empty, the user needs to run `/openclawd setup` or `/openclawd login`.

### Getting the API Base URL

```bash
echo "${OPENCLAWD_API_URL:-https://api.openclawd.ai}"
```

---

## Command: help

**Trigger**: `/openclawd` or `/openclawd help`

Display available commands and current status.

### Implementation

1. Read config to check if user is authenticated
2. If authenticated, fetch and display balance
3. Show command reference

### Output Format

```
OpenClawd - Agentic Commerce for Claude Code
=============================================

Status: [Authenticated as user@example.com | Not authenticated]
Balance: [$XX.XX USD | Run /openclawd setup to get started]

Commands:
  /openclawd setup              First-time setup (authenticate + buy credits)
  /openclawd login <email>      Authenticate with your email
  /openclawd balance            Check your credit balance
  /openclawd topup [amount]     Add credits ($10, $25, $50, or $100)
  /openclawd usage [days]       View usage history (default: 30 days)

API Commands:
  /openclawd xai <request>      Call xAI/Grok API
  /openclawd openai <request>   Call OpenAI API
  /openclawd amazon <request>   Call Crossmint/Amazon API

Quick Chat (simplified API access):
  /openclawd chat grok <message>       Chat with Grok
  /openclawd chat gpt-4 <message>      Chat with GPT-4
  /openclawd chat gpt-3.5 <message>    Chat with GPT-3.5

Documentation:
  See endpoint docs at .claude/skills/openclawd/endpoints/
```

---

## Command: setup

**Trigger**: `/openclawd setup`

First-time setup flow for new users.

### Implementation

1. Check if already configured:
   ```bash
   cat ~/.openclawd/config.json 2>/dev/null
   ```

2. If configured, ask if user wants to reconfigure

3. Prompt user for email:
   ```
   Let's set up OpenClawd!

   Please enter your email address to get started:
   ```

4. After user provides email, call the login flow (see login command)

5. After successful login, prompt for initial credit purchase:
   ```
   Great! You're now authenticated.

   Would you like to add credits now?
   - $10 (minimum)
   - $25
   - $50
   - $100

   Or type 'skip' to add credits later.
   ```

6. If user chooses an amount, call the topup flow

7. Final confirmation:
   ```
   Setup complete!

   Email: user@example.com
   Balance: $XX.XX USD

   You can now use:
   - /openclawd xai {...} to call Grok
   - /openclawd openai {...} to call GPT-4
   - /openclawd chat grok "Hello!" for quick chats
   ```

---

## Command: login

**Trigger**: `/openclawd login <email>` or `/openclawd login`

Authenticate user via magic link.

### Implementation

#### Step 1: Get Email

If email not provided in arguments, prompt user:
```
Please enter your email address:
```

Validate email format before proceeding.

#### Step 2: Send Magic Link

```bash
API_URL="${OPENCLAWD_API_URL:-https://api.openclawd.ai}"
curl -s -X POST "${API_URL}/auth/send-link" \
  -H "Content-Type: application/json" \
  -d '{"email": "USER_EMAIL_HERE"}'
```

Expected response:
```json
{
  "success": true,
  "message": "Magic link sent to your email"
}
```

#### Step 3: Inform User

```
Magic link sent!

Please check your email (USER_EMAIL_HERE) and click the verification link.

The link will:
1. Verify your email
2. Create your OpenClawd account (if new)
3. Display your API key

After clicking the link, come back here and run:
  /openclawd login-complete <api_key>

Or paste your API key when prompted.
```

#### Step 4: Wait for API Key

Prompt user to paste their API key:
```
Paste your API key here (starts with oc_):
```

#### Step 5: Verify and Save

Verify the API key works by checking balance:
```bash
API_URL="${OPENCLAWD_API_URL:-https://api.openclawd.ai}"
API_KEY="oc_user_provided_key"
curl -s -X GET "${API_URL}/credits/balance" \
  -H "Authorization: Bearer ${API_KEY}"
```

If successful, save config:
```bash
mkdir -p ~/.openclawd
cat > ~/.openclawd/config.json << 'EOF'
{
  "apiKey": "API_KEY_HERE",
  "email": "USER_EMAIL_HERE"
}
EOF
chmod 600 ~/.openclawd/config.json
```

#### Step 6: Confirm

```
Login successful!

Email: user@example.com
Balance: $XX.XX USD

Your API key has been saved to ~/.openclawd/config.json
```

### Error Handling

- Invalid email format: "Please enter a valid email address"
- API error: Display the error message from the API
- Invalid API key: "Invalid API key. Please check the key and try again."

---

## Command: balance

**Trigger**: `/openclawd balance`

Check current credit balance.

### Implementation

#### Step 1: Read Config

```bash
cat ~/.openclawd/config.json 2>/dev/null
```

If not found or no apiKey:
```
Not authenticated. Run /openclawd setup or /openclawd login first.
```

#### Step 2: Fetch Balance

```bash
API_URL="${OPENCLAWD_API_URL:-https://api.openclawd.ai}"
API_KEY="<from config>"
curl -s -X GET "${API_URL}/credits/balance" \
  -H "Authorization: Bearer ${API_KEY}"
```

Expected response:
```json
{
  "balance": 42.50,
  "currency": "USD"
}
```

#### Step 3: Display

```
OpenClawd Balance
=================
Current Balance: $42.50 USD

Low balance? Add more credits:
  /openclawd topup 25    Add $25
  /openclawd topup 50    Add $50
```

### Error Handling

- 401 Unauthorized: "Your API key is invalid or expired. Run /openclawd login to re-authenticate."
- Network error: "Unable to connect to OpenClawd API. Please try again."

---

## Command: topup / buy

**Trigger**: `/openclawd topup [amount]` or `/openclawd buy [amount]`

Add credits via Stripe checkout.

### Implementation

#### Step 1: Validate Amount

Valid amounts: $10, $25, $50, $100

If no amount provided, prompt:
```
How much would you like to add?
  $10  (minimum)
  $25
  $50
  $100
```

If invalid amount:
```
Invalid amount. Please choose $10, $25, $50, or $100.
```

#### Step 2: Read Config

```bash
cat ~/.openclawd/config.json 2>/dev/null
```

If not authenticated, redirect to setup.

#### Step 3: Create Checkout Session

```bash
API_URL="${OPENCLAWD_API_URL:-https://api.openclawd.ai}"
API_KEY="<from config>"
AMOUNT=25
curl -s -X POST "${API_URL}/stripe/checkout" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"amount\": ${AMOUNT}, \"returnUrl\": \"https://openclawd.ai/checkout/success\"}"
```

Expected response:
```json
{
  "success": true,
  "sessionId": "cs_...",
  "url": "https://checkout.stripe.com/..."
}
```

#### Step 4: Display Checkout Link

```
Stripe Checkout Session Created
================================

Amount: $25.00 USD

Please complete your purchase at:
https://checkout.stripe.com/...

After payment, your credits will be added automatically.
Run /openclawd balance to verify.
```

### Error Handling

- 401: Redirect to login
- Invalid amount: Show valid options

---

## Command: usage

**Trigger**: `/openclawd usage [days]`

View usage history and transaction log.

### Implementation

#### Step 1: Parse Days Parameter

Default: 30 days
Maximum: 365 days

```
days = argument provided or 30
```

#### Step 2: Read Config

```bash
cat ~/.openclawd/config.json 2>/dev/null
```

#### Step 3: Fetch Usage

```bash
API_URL="${OPENCLAWD_API_URL:-https://api.openclawd.ai}"
API_KEY="<from config>"
DAYS=30
curl -s -X GET "${API_URL}/credits/usage?days=${DAYS}" \
  -H "Authorization: Bearer ${API_KEY}"
```

Expected response:
```json
{
  "transactions": [
    {
      "id": "txn_123",
      "type": "usage",
      "amount": -0.0025,
      "description": "XAI API: /v1/chat/completions",
      "createdAt": "2026-02-01T15:30:00Z"
    },
    {
      "id": "txn_122",
      "type": "topup",
      "amount": 25.00,
      "description": "Credit purchase via Stripe",
      "createdAt": "2026-02-01T10:00:00Z"
    }
  ],
  "total": -12.50,
  "period": {
    "start": "2026-01-02T00:00:00Z",
    "end": "2026-02-01T23:59:59Z"
  }
}
```

#### Step 4: Display as Table

```
OpenClawd Usage History (Last 30 Days)
======================================

| Date       | Type   | Amount   | Description                    |
|------------|--------|----------|--------------------------------|
| 2026-02-01 | usage  | -$0.0025 | XAI API: /v1/chat/completions  |
| 2026-02-01 | topup  | +$25.00  | Credit purchase via Stripe     |
| 2026-01-31 | usage  | -$0.0150 | OPENAI API: /v1/chat/...       |
| ...        | ...    | ...      | ...                            |

Period: Jan 2 - Feb 1, 2026
Total Spent: $12.50
```

---

## Command: xai

**Trigger**: `/openclawd xai <request>`

Call xAI/Grok API endpoint.

### Implementation

#### Step 1: Parse Request

The request should be a JSON object. Example:
```json
{"model": "grok-4", "messages": [{"role": "user", "content": "Hello!"}]}
```

If user provides a string instead, wrap it:
```json
{"model": "grok-4", "messages": [{"role": "user", "content": "USER_STRING"}]}
```

#### Step 2: Read Config

```bash
cat ~/.openclawd/config.json 2>/dev/null
```

#### Step 3: Make API Request

For chat completions (default):
```bash
API_URL="${OPENCLAWD_API_URL:-https://api.openclawd.ai}"
API_KEY="<from config>"
curl -s -X POST "${API_URL}/gateway/xai/v1/chat/completions" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '<request_json>'
```

For responses API:
```bash
curl -s -X POST "${API_URL}/gateway/xai/v1/responses" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '<request_json>'
```

#### Step 4: Display Response

For chat completions:
```
Grok Response
=============
Model: grok-4

[Response content here]

---
Tokens: 12 input, 256 output
Cost: $0.0025 (shown in X-Cost-Total header)
```

### Error Handling

- 402 Insufficient balance: Show current balance and suggest topup
- 400 Invalid request: Show validation error
- 500/502 Gateway error: Show error message

### Endpoint Reference

See `.claude/skills/openclawd/endpoints/xai.md` for full API documentation.

---

## Command: openai

**Trigger**: `/openclawd openai <request>`

Call OpenAI API endpoint.

### Implementation

Same pattern as xai command, but using:
```bash
API_URL="${OPENCLAWD_API_URL:-https://api.openclawd.ai}"
curl -s -X POST "${API_URL}/gateway/openai/v1/chat/completions" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '<request_json>'
```

### Available Models

- gpt-4o (recommended)
- gpt-4o-mini
- gpt-4-turbo
- gpt-3.5-turbo
- o1-preview
- o1-mini

### Endpoint Reference

See `.claude/skills/openclawd/endpoints/openai.md` for full API documentation.

---

## Command: amazon

**Trigger**: `/openclawd amazon <request>`

Call Crossmint/Amazon headless checkout API.

### Implementation

#### Create Order

```bash
API_URL="${OPENCLAWD_API_URL:-https://api.openclawd.ai}"
curl -s -X POST "${API_URL}/gateway/amazon/api/v1/orders" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "productLocator": "amazon:B01DFKC2SO",
    "quantity": 1,
    "shippingAddress": {
      "firstName": "John",
      "lastName": "Doe",
      "address1": "123 Main St",
      "city": "New York",
      "state": "NY",
      "postalCode": "10001",
      "country": "US",
      "phoneNumber": "+12125551234"
    }
  }'
```

#### Check Order Status

```bash
curl -s -X GET "${API_URL}/gateway/amazon/api/v1/orders/{orderId}" \
  -H "Authorization: Bearer ${API_KEY}"
```

#### Confirm Purchase

```bash
curl -s -X POST "${API_URL}/gateway/amazon/api/v1/orders/{orderId}/pay" \
  -H "Authorization: Bearer ${API_KEY}"
```

### Endpoint Reference

See `.claude/skills/openclawd/endpoints/crossmint.md` for full API documentation.

---

## Command: chat

**Trigger**: `/openclawd chat <model> <message>`

Simplified chat interface for quick interactions.

### Implementation

#### Step 1: Parse Arguments

```
model = first argument (grok, gpt-4, gpt-3.5, etc.)
message = remaining arguments joined as string
```

#### Step 2: Map Model to Endpoint

| User Input | Endpoint | Model ID |
|------------|----------|----------|
| grok, grok-4 | xai | grok-4 |
| grok-3 | xai | grok-3 |
| gpt-4, gpt4o, gpt-4o | openai | gpt-4o |
| gpt-3.5, gpt35 | openai | gpt-3.5-turbo |
| o1 | openai | o1-preview |

#### Step 3: Build Request

```json
{
  "model": "<mapped_model_id>",
  "messages": [
    {"role": "user", "content": "<user_message>"}
  ]
}
```

#### Step 4: Make Request

Use the appropriate gateway endpoint based on mapping:
- xai: `/gateway/xai/v1/chat/completions`
- openai: `/gateway/openai/v1/chat/completions`

#### Step 5: Display Response

```
[Model Name] says:

<response content>

---
Tokens: X input, Y output | Cost: $0.00XX
```

### Examples

```
/openclawd chat grok "What's the meaning of life?"
/openclawd chat gpt-4 "Explain quantum computing"
/openclawd chat gpt-3.5 "Write a haiku about coding"
```

---

## Error Handling Reference

### Common Errors

| HTTP Code | Error Type | User Message |
|-----------|------------|--------------|
| 400 | Invalid Request | "Invalid request: [details from API]" |
| 401 | Auth Error | "Authentication failed. Run /openclawd login to re-authenticate." |
| 402 | Insufficient Balance | "Insufficient balance ($X.XX). Add credits with /openclawd topup" |
| 429 | Rate Limited | "Rate limited. Please wait [N] seconds and try again." |
| 500 | Server Error | "Server error. Please try again later." |
| 502 | Gateway Error | "Gateway error. The upstream API is unavailable." |

### Error Response Format

```
Error: [Error Type]
----------------------
[Error message from API]

Suggestion: [What the user can do to fix it]
```

---

## API Authentication

All authenticated endpoints require:
```
Authorization: Bearer <api_key>
```

The API key is stored in `~/.openclawd/config.json` and starts with `oc_`.

---

## Best Practices for Claude

1. **Always read config first** - Check `~/.openclawd/config.json` exists before making authenticated requests

2. **Handle errors gracefully** - Parse error responses and provide actionable suggestions

3. **Format output nicely** - Use tables, headers, and clear formatting for readability

4. **Show costs** - Display the `X-Cost-Total` header from gateway responses when available

5. **Confirm expensive operations** - For Amazon purchases, always show the total and ask for confirmation before `/pay`

6. **Mask sensitive data** - Don't display full API keys in output, show only last 4 characters

7. **Use correct endpoints**:
   - Auth endpoints: `/auth/*`
   - Credits endpoints: `/credits/*`
   - Stripe endpoints: `/stripe/*`
   - Gateway (AI APIs): `/gateway/xai/*`, `/gateway/openai/*`, `/gateway/amazon/*`

---

## Quick Reference: API Endpoints

| Command | Method | Endpoint |
|---------|--------|----------|
| login (send link) | POST | /auth/send-link |
| login (verify) | GET | /auth/verify?token=XXX |
| refresh key | POST | /auth/refresh |
| balance | GET | /credits/balance |
| usage | GET | /credits/usage?days=N |
| topup | POST | /stripe/checkout |
| xai chat | POST | /gateway/xai/v1/chat/completions |
| xai responses | POST | /gateway/xai/v1/responses |
| openai chat | POST | /gateway/openai/v1/chat/completions |
| amazon orders | POST | /gateway/amazon/api/v1/orders |
| amazon status | GET | /gateway/amazon/api/v1/orders/{id} |
| amazon pay | POST | /gateway/amazon/api/v1/orders/{id}/pay |
