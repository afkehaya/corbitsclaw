const schema = `
-- CorbitsClaw Database Schema
-- Run this in Supabase SQL Editor

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
  endpoint TEXT NOT NULL,
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

-- Atomic balance check and reserve function
-- This function atomically checks if a user has sufficient balance and reserves the amount
-- by inserting a pending usage record. Uses row-level locking to prevent race conditions.
-- Returns the reservation (credit entry) ID on success, NULL if insufficient balance.
CREATE OR REPLACE FUNCTION reserve_balance(
  p_user_id UUID,
  p_amount DECIMAL,
  p_request_id TEXT,
  p_description TEXT DEFAULT 'Reserved for API request'
)
RETURNS UUID AS $$
DECLARE
  v_balance DECIMAL;
  v_reservation_id UUID;
BEGIN
  -- Lock the user's credit rows to prevent concurrent modifications
  -- This ensures atomicity across check and reserve operations
  PERFORM 1 FROM credits WHERE user_id = p_user_id FOR UPDATE;

  -- Calculate current balance
  SELECT COALESCE(SUM(amount), 0) INTO v_balance
  FROM credits
  WHERE user_id = p_user_id;

  -- Check if balance is sufficient
  IF v_balance < p_amount THEN
    RETURN NULL;
  END IF;

  -- Insert the reservation (negative amount for usage)
  INSERT INTO credits (user_id, amount, type, description, request_id)
  VALUES (p_user_id, -p_amount, 'usage', p_description, p_request_id)
  RETURNING id INTO v_reservation_id;

  RETURN v_reservation_id;
END;
$$ LANGUAGE plpgsql;

-- Function to cancel a reservation (refund the reserved amount)
-- Used when an API request fails and we need to restore the user's balance
CREATE OR REPLACE FUNCTION cancel_reservation(
  p_reservation_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID;
  v_amount DECIMAL;
  v_request_id TEXT;
BEGIN
  -- Get the original reservation details
  SELECT user_id, amount, request_id INTO v_user_id, v_amount, v_request_id
  FROM credits
  WHERE id = p_reservation_id AND type = 'usage';

  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Insert a refund entry to reverse the reservation
  INSERT INTO credits (user_id, amount, type, description, request_id)
  VALUES (v_user_id, -v_amount, 'refund', 'Cancelled reservation', v_request_id);

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to adjust a reservation to the actual amount charged
-- Used when the actual x402 cost differs from the reserved amount
CREATE OR REPLACE FUNCTION adjust_reservation(
  p_reservation_id UUID,
  p_actual_amount DECIMAL,
  p_description TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID;
  v_reserved_amount DECIMAL;
  v_request_id TEXT;
  v_difference DECIMAL;
BEGIN
  -- Get the original reservation details (amount is negative for usage)
  SELECT user_id, amount, request_id INTO v_user_id, v_reserved_amount, v_request_id
  FROM credits
  WHERE id = p_reservation_id AND type = 'usage';

  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Calculate the difference (reserved is negative, actual should be positive input)
  -- If we reserved more than actual, we need to refund the difference
  v_difference := (-v_reserved_amount) - p_actual_amount;

  IF v_difference > 0 THEN
    -- Refund the excess
    INSERT INTO credits (user_id, amount, type, description, request_id)
    VALUES (v_user_id, v_difference, 'refund', COALESCE(p_description, 'Reservation adjustment'), v_request_id);
  ELSIF v_difference < 0 THEN
    -- Charge additional amount (rare case, should not happen with proper estimates)
    INSERT INTO credits (user_id, amount, type, description, request_id)
    VALUES (v_user_id, v_difference, 'usage', COALESCE(p_description, 'Reservation adjustment'), v_request_id);
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

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
`;

console.log(schema);
console.log('-- Copy the above SQL and run it in Supabase SQL Editor');
