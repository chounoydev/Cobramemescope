import { pool } from '../db.js'

async function deleteAccountRecords(client, { identityKey, email }) {
  const tables = await client.query(`
    SELECT to_regclass('public.user_login_events') AS login_events_table,
           to_regclass('public.site_visitors') AS visitors_table,
           to_regclass('public.site_activity_events') AS activity_table
  `)
  const existingTables = tables.rows[0]
  const walletAddress = identityKey.startsWith('evm:') ? identityKey.slice(4) : identityKey

  if (existingTables?.login_events_table) {
    if (email) {
      await client.query(
        'DELETE FROM user_login_events WHERE user_id IN (SELECT id FROM users WHERE email = $1)',
        [email],
      )
    } else {
      await client.query(
        'DELETE FROM user_login_events WHERE lower(wallet_address) = lower($1)',
        [walletAddress],
      )
    }
  }

  if (!email && existingTables?.visitors_table && existingTables.activity_table) {
    await client.query(
      `DELETE FROM site_activity_events
       WHERE visitor_id IN (
         SELECT visitor_id FROM site_visitors WHERE lower(wallet_address) = lower($1)
       )`,
      [walletAddress],
    )
    await client.query('DELETE FROM site_visitors WHERE lower(wallet_address) = lower($1)', [walletAddress])
  }

  await client.query('DELETE FROM user_profiles WHERE identity_key = $1', [identityKey])
  if (email) await client.query('DELETE FROM users WHERE email = $1', [email])
}

export async function processScheduledAccountDeletions() {
  if (!process.env.DATABASE_URL) {
    return 0
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const dueAccounts = await client.query(`
      SELECT identity_key, email
      FROM user_profiles
      WHERE deletion_scheduled_at <= NOW()
      ORDER BY deletion_scheduled_at
      LIMIT 25
      FOR UPDATE SKIP LOCKED
    `)

    for (const account of dueAccounts.rows) {
      await deleteAccountRecords(client, account)
    }

    await client.query('COMMIT')
    return dueAccounts.rowCount
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch (rollbackError) {
      console.error('Scheduled account deletion rollback failed:', rollbackError)
    }
    throw error
  } finally {
    client.release()
  }
}
