CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_profiles (
  identity_key TEXT PRIMARY KEY,
  email TEXT,
  username TEXT,
  avatar_seed INTEGER NOT NULL DEFAULT floor(random() * 2147483647)::INTEGER,
  tracked_wallet_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deletion_scheduled_at TIMESTAMPTZ,
  banned_at TIMESTAMPTZ,
  ban_reason TEXT,
  banned_by TEXT,
  invite_code TEXT,
  referred_by_identity_key TEXT REFERENCES user_profiles(identity_key) ON DELETE SET NULL
);

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS deletion_scheduled_at TIMESTAMPTZ;

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ;

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS ban_reason TEXT;

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS banned_by TEXT;

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS invite_code TEXT;

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS referred_by_identity_key TEXT REFERENCES user_profiles(identity_key) ON DELETE SET NULL;

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS tracked_wallet_address TEXT;

CREATE INDEX IF NOT EXISTS user_profiles_deletion_scheduled_at_idx
  ON user_profiles (deletion_scheduled_at)
  WHERE deletion_scheduled_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS user_profiles_banned_at_idx
  ON user_profiles (banned_at)
  WHERE banned_at IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_invite_code_idx
  ON user_profiles (invite_code)
  WHERE invite_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS user_profiles_referred_by_idx
  ON user_profiles (referred_by_identity_key)
  WHERE referred_by_identity_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_username_lower_idx
  ON user_profiles (LOWER(username))
  WHERE username IS NOT NULL;

CREATE TABLE IF NOT EXISTS user_login_events (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  wallet_address TEXT,
  auth_type TEXT NOT NULL CHECK (auth_type IN ('email', 'wallet')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS site_visitors (
  visitor_id TEXT PRIMARY KEY,
  wallet_address TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS site_activity_events (
  id BIGSERIAL PRIMARY KEY,
  visitor_id TEXT NOT NULL REFERENCES site_visitors(visitor_id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('site_visit', 'wallet_connect', 'contract_scan', 'token_track')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_staff_wallets (
  wallet_address TEXT PRIMARY KEY,
  added_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS landing_events (
  id BIGSERIAL PRIMARY KEY,
  badge TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  event_date TEXT NOT NULL DEFAULT '',
  cta TEXT NOT NULL DEFAULT 'Explore event',
  image_url TEXT NOT NULL DEFAULT '',
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS landing_event_images (
  id UUID PRIMARY KEY,
  content_type TEXT NOT NULL,
  image_data BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS site_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS watchlist (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coin_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, coin_id)
);

CREATE INDEX IF NOT EXISTS watchlist_coin_id_idx ON watchlist (coin_id);
CREATE INDEX IF NOT EXISTS user_login_events_created_at_idx ON user_login_events (created_at);
CREATE INDEX IF NOT EXISTS user_login_events_auth_type_idx ON user_login_events (auth_type);
CREATE INDEX IF NOT EXISTS site_activity_events_created_at_idx ON site_activity_events (created_at);
CREATE INDEX IF NOT EXISTS site_activity_events_event_type_idx ON site_activity_events (event_type);
CREATE INDEX IF NOT EXISTS landing_events_display_order_idx ON landing_events (display_order, id);
