import { query } from '../db.js'

async function ensureAnalyticsTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS user_login_events (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      wallet_address TEXT,
      auth_type TEXT NOT NULL CHECK (auth_type IN ('email', 'wallet')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await query(`
    CREATE TABLE IF NOT EXISTS site_visitors (
      visitor_id TEXT PRIMARY KEY,
      wallet_address TEXT,
      first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await query(`
    CREATE TABLE IF NOT EXISTS site_activity_events (
      id BIGSERIAL PRIMARY KEY,
      visitor_id TEXT NOT NULL REFERENCES site_visitors(visitor_id) ON DELETE CASCADE,
      event_type TEXT NOT NULL CHECK (event_type IN ('site_visit', 'wallet_connect', 'contract_scan', 'token_track')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
}

export async function recordSiteActivity({ visitorId, eventType, walletAddress = null }) {
  await ensureAnalyticsTables()
  await query(`
    INSERT INTO site_visitors (visitor_id, wallet_address)
    VALUES ($1, $2)
    ON CONFLICT (visitor_id) DO UPDATE SET
      wallet_address = COALESCE(EXCLUDED.wallet_address, site_visitors.wallet_address),
      last_seen_at = NOW()
  `, [visitorId, walletAddress])
  await query(
    'INSERT INTO site_activity_events (visitor_id, event_type) VALUES ($1, $2)',
    [visitorId, eventType],
  )
}

export async function getLoginStats() {
  await ensureAnalyticsTables()

  const result = await query(`
    WITH activity_users AS (
      SELECT COALESCE('wallet:' || lower(wallet_address), 'account:' || user_id::text) AS user_key, created_at
      FROM user_login_events
      UNION ALL
      SELECT COALESCE('wallet:' || lower(visitor.wallet_address), 'visitor:' || event.visitor_id) AS user_key, event.created_at
      FROM site_activity_events AS event
      JOIN site_visitors AS visitor USING (visitor_id)
    ),
    recent_logins AS (
      SELECT DISTINCT
        auth_type,
        CASE
          WHEN auth_type = 'email' THEN 'account:' || user_id::text
          ELSE 'wallet:' || lower(wallet_address)
        END AS user_key
      FROM user_login_events
      WHERE created_at >= now() - INTERVAL '24 hours'
        AND ((auth_type = 'email' AND user_id IS NOT NULL) OR (auth_type = 'wallet' AND wallet_address IS NOT NULL))
    )
    SELECT
      (SELECT COUNT(DISTINCT user_key) FROM activity_users WHERE created_at >= CURRENT_DATE) AS today,
      (SELECT COUNT(DISTINCT user_key) FROM activity_users WHERE created_at >= date_trunc('year', now())) AS this_year,
      (SELECT COUNT(DISTINCT user_key) FROM activity_users) AS all_time,
      (SELECT COUNT(DISTINCT user_key) FROM recent_logins) AS active_users_24h,
      (SELECT COUNT(DISTINCT user_key) FROM recent_logins WHERE auth_type = 'email') AS email_users_24h,
      (SELECT COUNT(DISTINCT user_key) FROM recent_logins WHERE auth_type = 'wallet') AS wallet_users_24h,
      (SELECT COUNT(DISTINCT lower(visitor.wallet_address))
       FROM site_activity_events AS event JOIN site_visitors AS visitor USING (visitor_id)
       WHERE event.event_type = 'wallet_connect' AND event.created_at >= CURRENT_DATE AND visitor.wallet_address IS NOT NULL) AS wallet_connections_today,
      (SELECT COUNT(*) FROM site_activity_events WHERE event_type = 'contract_scan' AND created_at >= CURRENT_DATE) AS contract_scans_today,
      (SELECT COUNT(*) FROM site_activity_events WHERE event_type = 'token_track' AND created_at >= CURRENT_DATE) AS tokens_tracked_today
  `)

  const row = result.rows[0] || {}
  return {
    today: Number(row.today || 0),
    thisYear: Number(row.this_year || 0),
    allTime: Number(row.all_time || 0),
    activeUsers24h: Number(row.active_users_24h || 0),
    emailUsers24h: Number(row.email_users_24h || 0),
    walletUsers24h: Number(row.wallet_users_24h || 0),
    walletConnectionsToday: Number(row.wallet_connections_today || 0),
    contractScansToday: Number(row.contract_scans_today || 0),
    tokensTrackedToday: Number(row.tokens_tracked_today || 0),
  }
}
