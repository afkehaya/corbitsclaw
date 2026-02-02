# OpenClawd Deployment Guide

Complete step-by-step guide to deploying OpenClawd to production.

## Prerequisites

Before starting, ensure you have:

- [ ] Node.js v20 or later
- [ ] pnpm v10.12.1 or later
- [ ] Vercel account and CLI
- [ ] Supabase account
- [ ] Stripe account
- [ ] Solana wallet with USDC
- [ ] Resend account (for emails)
- [ ] Domain for the API (e.g., api.openclaw.ai)

## Step 1: Supabase Setup

### 1.1 Create a Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Create a new project
3. Note down:
   - **Project URL**: `https://your-project.supabase.co`
   - **anon key**: Found in Settings > API

### 1.2 Run Database Migrations

1. Open the SQL Editor in Supabase Dashboard
2. Run the schema from `scripts/setup-db.ts`:

```sql
-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  api_key TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Credits ledger (append-only for audit trail)
CREATE TABLE IF NOT EXISTS credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  amount DECIMAL(12,6) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('deposit', 'usage', 'refund')),
  description TEXT,
  stripe_session_id TEXT,
  request_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Transaction log with cost breakdown
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  request_id TEXT UNIQUE NOT NULL,
  endpoint TEXT NOT NULL CHECK (endpoint IN ('xai', 'openai', 'amazon')),
  path TEXT NOT NULL,
  cost_x402 DECIMAL(12,6) NOT NULL,
  cost_margin DECIMAL(12,6) NOT NULL,
  cost_total DECIMAL(12,6) NOT NULL,
  margin_percent DECIMAL(5,2) NOT NULL,
  response_status INTEGER,
  response_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Magic link tokens (short-lived)
CREATE TABLE IF NOT EXISTS magic_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Admin config (key-value store)
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT
);

-- Admin sessions
CREATE TABLE IF NOT EXISTS admin_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Admin settings
CREATE TABLE IF NOT EXISTS admin_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_credits_user_id ON credits(user_id);
CREATE INDEX IF NOT EXISTS idx_credits_created_at ON credits(created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_endpoint ON transactions(endpoint);
CREATE INDEX IF NOT EXISTS idx_magic_links_token ON magic_links(token);
CREATE INDEX IF NOT EXISTS idx_magic_links_email ON magic_links(email);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON admin_sessions(token);

-- Helper function: Get user balance
CREATE OR REPLACE FUNCTION get_user_balance(p_user_id UUID)
RETURNS DECIMAL AS $$
  SELECT COALESCE(SUM(amount), 0)
  FROM credits
  WHERE user_id = p_user_id;
$$ LANGUAGE SQL STABLE;

-- Default config values
INSERT INTO config (key, value) VALUES
  ('margin_global', '{"percent": 30}'),
  ('margin_xai', '{"percent": null}'),
  ('margin_openai', '{"percent": null}'),
  ('margin_amazon', '{"percent": null}'),
  ('wallet_alert_threshold', '{"usd": 1000}'),
  ('admin_password_hash', '{"hash": null}')
ON CONFLICT (key) DO NOTHING;

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to users table
DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Apply trigger to config table
DROP TRIGGER IF EXISTS config_updated_at ON config;
CREATE TRIGGER config_updated_at
  BEFORE UPDATE ON config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
```

### 1.3 Configure Row Level Security (Optional)

For production, enable RLS on tables:

```sql
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE magic_links ENABLE ROW LEVEL SECURITY;

-- Service role can access everything
CREATE POLICY "Service role full access" ON users
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access" ON credits
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access" ON transactions
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access" ON magic_links
  FOR ALL USING (auth.role() = 'service_role');
```

---

## Step 2: Stripe Setup

### 2.1 Create Stripe Account

1. Go to [stripe.com](https://stripe.com)
2. Complete account verification for production use

### 2.2 Get API Keys

1. Go to Developers > API keys
2. Note down:
   - **Secret key**: `sk_live_...` (or `sk_test_...` for testing)

### 2.3 Configure Webhook

1. Go to Developers > Webhooks
2. Add endpoint:
   - **URL**: `https://api.openclaw.ai/stripe/webhook`
   - **Events to listen for**:
     - `checkout.session.completed`
     - `payment_intent.succeeded`
     - `payment_intent.payment_failed`

3. Note down:
   - **Webhook signing secret**: `whsec_...`

### 2.4 Create Products (Optional)

For fixed credit packages, create Stripe Products:

| Product | Price | Credits |
|---------|-------|---------|
| Credits $10 | $10.00 | $10 |
| Credits $25 | $25.00 | $25 |
| Credits $50 | $50.00 | $50 |
| Credits $100 | $100.00 | $100 |

---

## Step 3: Solana Wallet Setup

### 3.1 Generate a New Wallet

Using Solana CLI:

```bash
solana-keygen new --outfile ~/.config/solana/openclawd-wallet.json
```

Or use any Solana wallet (Phantom, Solflare) and export the private key.

### 3.2 Get Base58 Private Key

If using a JSON file:

```javascript
const fs = require('fs');
const bs58 = require('bs58');

const keypair = JSON.parse(fs.readFileSync('wallet.json'));
const privateKey = bs58.encode(Buffer.from(keypair));
console.log(privateKey);
```

### 3.3 Fund the Wallet

1. Get the public address from the wallet
2. Transfer USDC to the wallet:
   - **Mainnet USDC**: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
   - Recommended starting balance: $1,000+ USDC

3. Ensure there's a small amount of SOL for transaction fees (~0.1 SOL)

### 3.4 Choose RPC Provider

For production, use a premium RPC:
- Helius: `https://rpc.helius.xyz/?api-key=YOUR_KEY`
- QuickNode: Your QuickNode endpoint
- Default: `https://api.mainnet-beta.solana.com` (rate limited)

---

## Step 4: Email Setup (Resend)

### 4.1 Create Resend Account

1. Go to [resend.com](https://resend.com)
2. Create an account

### 4.2 Verify Domain

1. Add your domain (e.g., `openclaw.ai`)
2. Add the required DNS records
3. Wait for verification

### 4.3 Get API Key

1. Go to API Keys
2. Create a new key
3. Note down: `re_...`

---

## Step 5: Vercel Deployment

### 5.1 Install Vercel CLI

```bash
npm i -g vercel
```

### 5.2 Link Project

```bash
cd apps/api
vercel link
```

### 5.3 Set Environment Variables

In Vercel Dashboard (Project > Settings > Environment Variables), add:

```
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJ...

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Solana
SOLANA_PRIVATE_KEY=base58_encoded_private_key_here
RPC_URL=https://rpc.helius.xyz/?api-key=YOUR_KEY

# Email
RESEND_API_KEY=re_...

# Admin
ADMIN_API_KEY=generate_a_secure_random_string

# Config
MARGIN_PERCENT=30
```

**Important**: Mark all secrets as "Sensitive" and restrict to Production environment.

### 5.4 Deploy

```bash
# Preview deployment
vercel

# Production deployment
vercel --prod
```

### 5.5 Verify Deployment

```bash
curl https://your-project.vercel.app/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

---

## Step 6: Domain Configuration

### 6.1 Add Custom Domain in Vercel

1. Go to Project > Settings > Domains
2. Add `api.openclaw.ai`
3. Follow DNS configuration instructions

### 6.2 Update DNS

Add the required records at your DNS provider:
- **CNAME**: `api` -> `cname.vercel-dns.com`

Or if using apex domain:
- **A**: `@` -> Vercel IP addresses

### 6.3 Wait for SSL

Vercel automatically provisions SSL certificates. This may take a few minutes.

### 6.4 Update Stripe Webhook

Update the webhook URL in Stripe to use your custom domain:
`https://api.openclaw.ai/stripe/webhook`

---

## Environment Variables Reference

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `SUPABASE_URL` | Yes | Supabase project URL | `https://xxx.supabase.co` |
| `SUPABASE_ANON_KEY` | Yes | Supabase anonymous key | `eyJ...` |
| `STRIPE_SECRET_KEY` | Yes | Stripe secret key | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | Yes | Stripe webhook signing secret | `whsec_...` |
| `SOLANA_PRIVATE_KEY` | Yes | Base58 encoded private key | `5abc...` |
| `RPC_URL` | No | Solana RPC endpoint | `https://api.mainnet-beta.solana.com` |
| `RESEND_API_KEY` | Yes | Resend API key for emails | `re_...` |
| `ADMIN_API_KEY` | Yes | Admin authentication key | Random string |
| `MARGIN_PERCENT` | No | Default margin on API calls | `30` |

---

## Post-Deployment Checklist

- [ ] API health check returns `200 OK`
- [ ] Magic link emails are sending
- [ ] Stripe webhook is verified (check Stripe Dashboard)
- [ ] Test purchase flow with Stripe test mode
- [ ] Verify wallet has sufficient USDC balance
- [ ] Test gateway endpoints with a small request
- [ ] Admin endpoints return correct metrics
- [ ] SSL certificate is active
- [ ] Custom domain resolves correctly

---

## Monitoring

### Vercel Logs

View real-time logs:
```bash
vercel logs --follow
```

### Supabase

Monitor database in Supabase Dashboard:
- Table Editor: View data
- Logs: Database queries
- Reports: Usage statistics

### Wallet Balance

Monitor the Solana wallet balance and set up alerts:
```bash
# Check balance
solana balance <WALLET_ADDRESS> --url mainnet-beta
```

Set up low balance alerts through:
- Helius webhooks
- Custom monitoring script
- Solana FM notifications

---

## Troubleshooting

### "Wallet not initialized" Error

1. Check `SOLANA_PRIVATE_KEY` is set correctly
2. Verify it's base58 encoded
3. Test decoding:
   ```javascript
   const bs58 = require('bs58');
   bs58.decode(privateKey); // Should not throw
   ```

### Stripe Webhook Failures

1. Check webhook signing secret matches
2. Verify endpoint URL is correct
3. Check Vercel logs for errors
4. Test with Stripe CLI:
   ```bash
   stripe listen --forward-to localhost:3000/stripe/webhook
   ```

### Magic Link Not Sending

1. Verify Resend API key
2. Check domain is verified in Resend
3. Check Vercel logs for email errors

### Insufficient Balance (402)

1. Check user's credit balance
2. Verify Stripe webhook is processing deposits
3. Check credits table in Supabase

### Gateway Errors (502)

1. Check Corbits endpoint status
2. Verify wallet has USDC
3. Check x402 payment is succeeding
4. Review transaction logs

---

## Rollback

If issues arise after deployment:

1. Identify the last working deployment in Vercel Dashboard
2. Click "Promote to Production" on that deployment
3. Or use CLI:
   ```bash
   vercel rollback
   ```

---

## Updating

To deploy updates:

1. Push changes to your repository
2. Run the build locally to verify:
   ```bash
   make
   ```
3. Deploy:
   ```bash
   cd apps/api
   vercel --prod
   ```

For database schema changes:
1. Test migrations in a staging environment first
2. Run SQL in Supabase SQL Editor
3. Update application code
4. Deploy
