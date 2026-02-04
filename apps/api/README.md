# @corbitsclaw/api

The CorbitsClaw API server built with Hono, deployed to Vercel Edge Functions.

## Overview

This API provides:

- **Authentication**: Magic link passwordless auth
- **Credits**: Balance management and Stripe integration
- **Gateway**: Proxy to Corbits endpoints with x402 payments
- **Admin**: Dashboard API for configuration and metrics

## Quick Start

### Local Development

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Server runs at http://localhost:3000
```

### Environment Variables

Create a `.env` file:

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJ...

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Solana Wallet
SOLANA_PRIVATE_KEY=base58_encoded_private_key
RPC_URL=https://api.mainnet-beta.solana.com

# Email (Resend)
RESEND_API_KEY=re_...

# Admin
ADMIN_API_KEY=your_secure_admin_key

# Config
MARGIN_PERCENT=30
```

### Build

```bash
pnpm build
```

### Test

```bash
pnpm test
```

## API Endpoints

### Health Check

#### `GET /`

Returns service status.

**Response:**

```json
{
  "status": "ok",
  "service": "@corbitsclaw/api"
}
```

#### `GET /health`

Returns health status with timestamp.

**Response:**

```json
{
  "status": "healthy",
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

---

### Authentication

#### `POST /auth/send-link`

Send a magic link to the user's email.

**Request:**

```json
{
  "email": "user@example.com"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Magic link sent to your email"
}
```

**Errors:**

- `400`: Invalid email format
- `500`: Failed to send email

---

#### `GET /auth/verify`

Verify a magic link token and get API key.

**Query Parameters:**

- `token` (required): The magic link token

**Response:**

```json
{
  "success": true,
  "api_key": "oc_abc123def456...",
  "email": "user@example.com",
  "is_new_user": true
}
```

**Errors:**

- `400`: Token is required
- `401`: Invalid or expired token

---

#### `POST /auth/refresh`

Generate a new API key (invalidates the old one).

**Headers:**

```
Authorization: Bearer oc_your_api_key
```

**Response:**

```json
{
  "success": true,
  "api_key": "oc_new_key_xyz...",
  "message": "API key refreshed. Your previous key is now invalid."
}
```

**Errors:**

- `401`: Missing or invalid authorization

---

### Credits

#### `GET /credits/balance`

Get the user's current balance.

**Headers:**

```
X-User-Id: user_uuid_here
```

**Response:**

```json
{
  "balance": 45.23,
  "currency": "USD"
}
```

**Errors:**

- `401`: Missing X-User-Id header

---

#### `GET /credits/usage`

Get the user's transaction history.

**Headers:**

```
X-User-Id: user_uuid_here
```

**Query Parameters:**

- `days` (optional): Number of days to look back (default: 30)

**Response:**

```json
{
  "transactions": [
    {
      "id": "uuid",
      "userId": "uuid",
      "requestId": "req_abc123",
      "endpoint": "openai",
      "path": "/v1/chat/completions",
      "costX402": 0.0012,
      "costMargin": 0.00036,
      "costTotal": 0.00156,
      "marginPercent": 30,
      "responseStatus": 200,
      "responseTimeMs": 1234,
      "createdAt": "2025-01-15T10:30:00.000Z"
    }
  ],
  "total": 12.34,
  "period": {
    "start": "2024-12-16T00:00:00.000Z",
    "end": "2025-01-15T23:59:59.999Z"
  }
}
```

**Errors:**

- `400`: days must be a positive integer
- `401`: Missing X-User-Id header

---

### Stripe

#### `POST /stripe/checkout`

Create a Stripe Checkout session for purchasing credits.

**Headers:**

```
Authorization: Bearer oc_your_api_key
```

**Request:**

```json
{
  "amount": 50,
  "returnUrl": "https://example.com/return"
}
```

**Response:**

```json
{
  "success": true,
  "sessionId": "cs_test_...",
  "url": "https://checkout.stripe.com/c/pay/cs_test_..."
}
```

**Errors:**

- `400`: amount must be a positive number
- `400`: returnUrl is required and must be a valid URL
- `401`: Missing or invalid authorization

---

#### `GET /stripe/session/:id`

Get the status of a checkout session.

**Headers:**

```
Authorization: Bearer oc_your_api_key
```

**Response:**

```json
{
  "success": true,
  "session": {
    "id": "cs_test_...",
    "status": "complete",
    "payment_status": "paid",
    "amount_total": 5000
  }
}
```

**Errors:**

- `400`: Session ID is required
- `401`: Missing or invalid authorization

---

#### `POST /stripe/webhook`

Handle Stripe webhook events. Called by Stripe.

**Headers:**

```
stripe-signature: t=1234567890,v1=...
```

**Request Body:** Raw Stripe webhook payload

**Response:**

```json
{
  "received": true
}
```

**Errors:**

- `400`: Missing stripe-signature header
- `400`: Invalid signature

---

### Gateway (AI API Proxies)

All gateway endpoints require authentication and deduct credits based on usage.

#### `POST /gateway/xai/*`

Proxy requests to xAI/Grok endpoint.

**Headers:**

```
Authorization: Bearer oc_your_api_key
Content-Type: application/json
```

**Request Example (`/gateway/xai/v1/chat/completions`):**

```json
{
  "model": "grok-4",
  "messages": [
    { "role": "system", "content": "You are a helpful assistant." },
    { "role": "user", "content": "Hello!" }
  ],
  "temperature": 0.7
}
```

**Response Headers:**

```
X-Request-Id: req_abc123...
X-Cost-Total: 0.001234
```

**Response:** Passthrough from xAI API

**Errors:**

- `401`: Missing or invalid authorization
- `402`: Insufficient balance
- `502`: Upstream API error

---

#### `POST /gateway/openai/*`

Proxy requests to OpenAI endpoint.

**Headers:**

```
Authorization: Bearer oc_your_api_key
Content-Type: application/json
```

**Request Example (`/gateway/openai/v1/chat/completions`):**

```json
{
  "model": "gpt-4o",
  "messages": [{ "role": "user", "content": "What is 2+2?" }],
  "max_tokens": 100
}
```

**Response:** Passthrough from OpenAI API

---

#### `POST /gateway/amazon/*`

Proxy requests to Crossmint/Amazon endpoint.

**Headers:**

```
Authorization: Bearer oc_your_api_key
Content-Type: application/json
```

**Request Example (`/gateway/amazon/api/v1/orders`):**

```json
{
  "productLocator": "amazon:B01DFKC2SO",
  "quantity": 1,
  "shippingAddress": {
    "name": "John Doe",
    "line1": "123 Main St",
    "city": "San Francisco",
    "state": "CA",
    "postalCode": "94102",
    "country": "US"
  },
  "email": "user@example.com"
}
```

**Response:** Passthrough from Crossmint API

---

### Admin

All admin endpoints require the `ADMIN_API_KEY` header.

#### `GET /admin/users`

List all users with their balances.

**Headers:**

```
Authorization: Bearer your_admin_api_key
```

**Query Parameters:**

- `limit` (optional): Number of users to return (default: 50, max: 100)
- `offset` (optional): Number of users to skip (default: 0)

**Response:**

```json
{
  "users": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "balance": 45.23,
      "createdAt": "2025-01-01T00:00:00.000Z"
    }
  ],
  "total": 150
}
```

---

#### `GET /admin/users/:userId`

Get a single user with recent transactions.

**Headers:**

```
Authorization: Bearer your_admin_api_key
```

**Response:**

```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "balance": 45.23,
    "createdAt": "2025-01-01T00:00:00.000Z"
  },
  "recentTransactions": [...]
}
```

---

#### `GET /admin/transactions`

List all transactions with filtering.

**Headers:**

```
Authorization: Bearer your_admin_api_key
```

**Query Parameters:**

- `limit`, `offset`: Pagination
- `userId`: Filter by user
- `endpoint`: Filter by endpoint (xai, openai, amazon)
- `startDate`, `endDate`: Filter by date range (ISO 8601)

**Response:**

```json
{
  "transactions": [...],
  "total": 5432
}
```

---

#### `GET /admin/metrics`

Get system-wide metrics.

**Headers:**

```
Authorization: Bearer your_admin_api_key
```

**Response:**

```json
{
  "totalUsers": 150,
  "totalRevenue": 12345.67,
  "totalApiCost": 8641.97,
  "totalMarginEarned": 3703.7,
  "transactions": {
    "last24h": 234,
    "last7d": 1543,
    "last30d": 5432
  }
}
```

---

#### `GET /admin/settings`

Get current admin settings.

**Headers:**

```
Authorization: Bearer your_admin_api_key
```

**Response:**

```json
{
  "marginPercent": 30
}
```

---

#### `PUT /admin/settings`

Update admin settings.

**Headers:**

```
Authorization: Bearer your_admin_api_key
```

**Request:**

```json
{
  "marginPercent": 25
}
```

**Response:**

```json
{
  "success": true,
  "marginPercent": 25
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "error": "Error Type",
  "message": "Human-readable description"
}
```

| Status | Error Type            | Description             |
| ------ | --------------------- | ----------------------- |
| 400    | Invalid request       | Bad request parameters  |
| 401    | Authentication failed | Missing or invalid auth |
| 402    | Insufficient balance  | Not enough credits      |
| 403    | Forbidden             | Action not allowed      |
| 500    | Internal server error | Unexpected error        |
| 502    | Gateway error         | Upstream API failure    |

---

## Deployment to Vercel

### 1. Install Vercel CLI

```bash
npm i -g vercel
```

### 2. Configure Project

The `vercel.json` is already configured for Edge Functions:

```json
{
  "buildCommand": "pnpm build",
  "devCommand": "pnpm dev",
  "installCommand": "pnpm install",
  "framework": null,
  "functions": {
    "src/index.ts": {
      "runtime": "edge"
    }
  },
  "routes": [
    {
      "src": "/(.*)",
      "dest": "/src/index.ts"
    }
  ]
}
```

### 3. Deploy

```bash
# From the api directory
cd apps/api
vercel

# For production
vercel --prod
```

### 4. Set Environment Variables

In the Vercel dashboard, add all required environment variables under Project Settings > Environment Variables.

---

## Architecture

```
src/
+-- index.ts              # Hono app entry, mounts routes
+-- routes/
|   +-- auth.ts           # Authentication routes
|   +-- credits.ts        # Balance and usage routes
|   +-- stripe.ts         # Stripe checkout and webhooks
|   +-- gateway.ts        # AI API proxy routes
|   +-- admin.ts          # Admin dashboard API
+-- services/
|   +-- auth.ts           # Magic link, token validation
|   +-- ledger.ts         # Credit operations
|   +-- stripe.ts         # Stripe integration
|   +-- wallet.ts         # Solana wallet, x402 requests
|   +-- email.ts          # Email sending via Resend
+-- middleware/
|   +-- auth.ts           # API key validation
|   +-- admin.ts          # Admin auth validation
+-- lib/
    +-- supabase.ts       # Supabase client
    +-- errors.ts         # Custom error types
```
