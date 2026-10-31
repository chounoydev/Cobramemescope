import { pool, query } from '../db.js'

export const COBRA_POINTS_SUPPLY = 17000000

let rewardsTableSetup

export async function ensureRewardsTables() {
  if (!rewardsTableSetup) {
    rewardsTableSetup = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS cobra_point_pool (
          id SMALLINT PRIMARY KEY CHECK (id = 1),
          total_supply BIGINT NOT NULL,
          remaining_supply BIGINT NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
      await query(`INSERT INTO cobra_point_pool (id, total_supply, remaining_supply)
                   VALUES (1, ${COBRA_POINTS_SUPPLY}, ${COBRA_POINTS_SUPPLY})
                   ON CONFLICT (id) DO NOTHING`)
      await query(`UPDATE cobra_point_pool
                   SET total_supply = $1,
                       remaining_supply = LEAST(remaining_supply, $1),
                       updated_at = NOW()
                   WHERE id = 1
                     AND (total_supply <> $1 OR remaining_supply > $1)`,
      [COBRA_POINTS_SUPPLY])
      await query(`
        CREATE TABLE IF NOT EXISTS cobra_tasks (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          points INTEGER NOT NULL CHECK (points > 0),
          active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
      await query(`ALTER TABLE cobra_tasks ADD COLUMN IF NOT EXISTS task_type TEXT NOT NULL DEFAULT 'general'`)
      await query(`ALTER TABLE cobra_tasks ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT ''`)
      await query(`ALTER TABLE cobra_tasks ADD COLUMN IF NOT EXISTS action_url TEXT NOT NULL DEFAULT ''`)
      await query(`ALTER TABLE cobra_tasks ADD COLUMN IF NOT EXISTS verification TEXT NOT NULL DEFAULT 'manual'`)
      await query(`ALTER TABLE cobra_tasks ADD COLUMN IF NOT EXISTS proof_label TEXT NOT NULL DEFAULT 'Proof link or username'`)
      await query(`UPDATE cobra_tasks SET verification = 'manual' WHERE verification = 'automatic'`)
      await query(`
        CREATE TABLE IF NOT EXISTS cobra_point_ledger (
          id BIGSERIAL PRIMARY KEY,
          identity_key TEXT NOT NULL,
          amount BIGINT NOT NULL CHECK (amount > 0),
          reason TEXT NOT NULL,
          reason_key TEXT NOT NULL UNIQUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
      await query(`
        CREATE TABLE IF NOT EXISTS cobra_task_completions (
          identity_key TEXT NOT NULL,
          task_id TEXT NOT NULL REFERENCES cobra_tasks(id) ON DELETE CASCADE,
          completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (identity_key, task_id)
        )
      `)
      await query(`
        CREATE TABLE IF NOT EXISTS cobra_task_submissions (
          id BIGSERIAL PRIMARY KEY,
          identity_key TEXT NOT NULL,
          task_id TEXT NOT NULL REFERENCES cobra_tasks(id) ON DELETE CASCADE,
          proof TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
          reviewed_at TIMESTAMPTZ,
          review_note TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (identity_key, task_id)
        )
      `)
      await query(`
        CREATE TABLE IF NOT EXISTS cobra_daily_login_streaks (
          identity_key TEXT PRIMARY KEY,
          current_streak INTEGER NOT NULL DEFAULT 0,
          longest_streak INTEGER NOT NULL DEFAULT 0,
          last_claim_date DATE,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
      await reconcileExistingReferrals()
    })().catch((error) => {
      rewardsTableSetup = undefined
      throw error
    })
  }

  async function reconcileExistingReferrals() {
    const referrals = await query(`
      SELECT identity_key AS invited_identity, referred_by_identity_key AS inviter_identity
      FROM user_profiles
      WHERE referred_by_identity_key IS NOT NULL
        AND referred_by_identity_key <> identity_key
    `)
    for (const referral of referrals.rows) {
      const legacy = await query(
        `SELECT amount FROM cobra_point_ledger
         WHERE reason_key = 'invite:' || $1 || ':' || $2`,
        [referral.inviter_identity, referral.invited_identity],
      )
      const legacyAmount = Number(legacy.rows[0]?.amount || 0)
      if (legacyAmount >= 500) continue
      const amount = legacyAmount > 0 ? 400 : 500
      await query(
        `WITH adjustment AS (
           INSERT INTO cobra_point_ledger (identity_key, amount, reason, reason_key)
           SELECT $1, $3, $4, $2
           WHERE NOT EXISTS (
             SELECT 1 FROM cobra_point_ledger
             WHERE reason_key = $2
           )
           AND (SELECT remaining_supply FROM cobra_point_pool WHERE id = 1) >= $3
           RETURNING amount
         )
         UPDATE cobra_point_pool
         SET remaining_supply = remaining_supply - COALESCE((SELECT amount FROM adjustment), 0),
             updated_at = NOW()
         WHERE id = 1 AND EXISTS (SELECT 1 FROM adjustment)`,
         [
           referral.inviter_identity,
           `invite-500-adjustment:${referral.inviter_identity}:${referral.invited_identity}`,
           amount,
           legacyAmount > 0 ? 'Referral reward adjustment to 500 points' : 'Successful invite reconciliation',
         ],
      )
    }
  }
  await rewardsTableSetup
}

export async function awardCobraPoints(identityKey, amount, reason, reasonKey, client = pool) {
  await ensureRewardsTables()
  if (!identityKey || !Number.isInteger(amount) || amount <= 0) return null
  const result = await client.query(
    `WITH pool AS (
       SELECT remaining_supply FROM cobra_point_pool WHERE id = 1 FOR UPDATE
     ),
     eligible AS (
       SELECT 1 FROM pool WHERE remaining_supply >= $2
       AND NOT EXISTS (SELECT 1 FROM cobra_point_ledger WHERE reason_key = $4)
     ),
     inserted AS (
       INSERT INTO cobra_point_ledger (identity_key, amount, reason, reason_key)
       SELECT $1, $2, $3, $4 FROM eligible
       RETURNING amount
     ),
     updated_pool AS (
       UPDATE cobra_point_pool
       SET remaining_supply = remaining_supply - COALESCE((SELECT amount FROM inserted), 0),
           updated_at = NOW()
       WHERE id = 1 AND EXISTS (SELECT 1 FROM inserted)
       RETURNING remaining_supply
     )
     SELECT COALESCE((SELECT amount FROM inserted), 0)::BIGINT AS awarded,
            (SELECT remaining_supply FROM updated_pool)::BIGINT AS remaining_supply`,
    [identityKey, amount, reason, reasonKey],
  )
  return result.rows[0]?.awarded ? result.rows[0] : null
}

export async function getCobraPoints(identityKey) {
  await ensureRewardsTables()
  const result = await query(
    `SELECT COALESCE(SUM(amount), 0)::BIGINT AS total_points
     FROM cobra_point_ledger WHERE identity_key = $1`,
    [identityKey],
  )
  return Number(result.rows[0]?.total_points || 0)
}

export async function claimDailyLogin(identityKey) {
  await ensureRewardsTables()
  if (!identityKey) return null

  const result = await query(`
    WITH today AS (
      SELECT CURRENT_DATE AS claim_date
    ),
    existing AS (
      SELECT streaks.*
      FROM cobra_daily_login_streaks streaks, today
      WHERE streaks.identity_key = $1
        AND streaks.last_claim_date = today.claim_date
    ),
    previous AS (
      SELECT streaks.*
      FROM cobra_daily_login_streaks streaks, today
      WHERE streaks.identity_key = $1
        AND streaks.last_claim_date = today.claim_date - 1
    ),
    calculated AS (
      SELECT CASE
        WHEN EXISTS (SELECT 1 FROM existing) THEN 0
        ELSE LEAST(COALESCE((SELECT current_streak FROM previous), 0) + 1, 100)
      END AS streak
    ),
    updated AS (
      UPDATE cobra_daily_login_streaks
      SET current_streak = CASE WHEN EXISTS (SELECT 1 FROM existing)
                                THEN cobra_daily_login_streaks.current_streak
                                ELSE (SELECT streak FROM calculated) END,
          longest_streak = CASE WHEN EXISTS (SELECT 1 FROM existing)
                                THEN cobra_daily_login_streaks.longest_streak
                                ELSE GREATEST(cobra_daily_login_streaks.longest_streak, (SELECT streak FROM calculated)) END,
          last_claim_date = (SELECT claim_date FROM today),
          updated_at = NOW()
      WHERE identity_key = $1 AND NOT EXISTS (SELECT 1 FROM existing)
      RETURNING current_streak
    ),
    inserted AS (
      INSERT INTO cobra_daily_login_streaks (identity_key, current_streak, longest_streak, last_claim_date)
      SELECT $1, streak, streak, claim_date
      FROM calculated CROSS JOIN today
      WHERE (SELECT streak FROM calculated) > 0
        AND NOT EXISTS (SELECT 1 FROM cobra_daily_login_streaks WHERE identity_key = $1)
      RETURNING current_streak
    ),
    streak AS (
      SELECT current_streak FROM updated
      UNION ALL
      SELECT current_streak FROM inserted
      UNION ALL
      SELECT current_streak FROM existing
    )
    SELECT current_streak, EXISTS (SELECT 1 FROM existing) AS already_claimed
    FROM streak LIMIT 1`,
    [String(identityKey)],
  )

  if (!result.rows[0] || result.rows[0].already_claimed) return { awarded: 0, alreadyClaimed: true, streak: Number(result.rows[0]?.current_streak || 0) }
  const streak = Number(result.rows[0].current_streak)
  const points = Math.min(100, 50 + Math.floor(((streak - 1) * 50) / 99))
  const awarded = await awardCobraPoints(String(identityKey), points, 'Daily login reward', `daily-login:${String(identityKey)}:${new Date().toISOString().slice(0, 10)}`)
  return {
    awarded: awarded ? points : 0,
    alreadyClaimed: false,
    streak,
    points,
  }
}
