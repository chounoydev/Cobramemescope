import { randomUUID } from 'node:crypto'
import { query } from '../db.js'

const defaultEvents = [
  {
    badge: 'LIVE EVENT',
    title: 'MemeScope Launch Night',
    description: 'Track the newest pairs, liquidity shifts, and risk signals before the next wave hits.',
    eventDate: 'Nov 14 · 6:30 PM',
    cta: 'Explore market pulse',
    imageUrl: '',
  },
  {
    badge: 'COMMUNITY DROP',
    title: 'Solana alpha brief',
    description: 'Fresh token screening, holder risk snapshots, and launch desk intel for active communities.',
    eventDate: 'Nov 18 · 8:00 PM',
    cta: 'Join the briefing',
    imageUrl: '',
  },
  {
    badge: 'RISK REPORT',
    title: 'Contract review masterclass',
    description: 'Learn how to read holder concentration, creator controls, and live liquidity risk at a glance.',
    eventDate: 'Nov 21 · 4:00 PM',
    cta: 'See the event',
    imageUrl: '',
  },
]

export async function ensureContentTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS admin_staff_wallets (
      wallet_address TEXT PRIMARY KEY,
      added_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await query(`
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
    )
  `)
  await query(`
    CREATE TABLE IF NOT EXISTS landing_event_images (
      id UUID PRIMARY KEY,
      content_type TEXT NOT NULL,
      image_data BYTEA NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  const existing = await query('SELECT 1 FROM landing_events LIMIT 1')
  if (existing.rowCount === 0) {
    for (const [index, event] of defaultEvents.entries()) {
      await query(
        `INSERT INTO landing_events (badge, title, description, event_date, cta, image_url, display_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [event.badge, event.title, event.description, event.eventDate, event.cta, event.imageUrl, index],
      )
    }
  }
}

export async function saveLandingEventImage(contentType, imageData) {
  await ensureContentTables()
  const id = randomUUID()
  await query(
    'INSERT INTO landing_event_images (id, content_type, image_data) VALUES ($1, $2, $3)',
    [id, contentType, imageData],
  )
  return id
}

export async function getLandingEventImage(id) {
  await ensureContentTables()
  const result = await query(
    'SELECT content_type, image_data FROM landing_event_images WHERE id = $1',
    [id],
  )
  return result.rows[0] || null
}

function mapEvent(row) {
  return {
    id: String(row.id),
    badge: row.badge,
    title: row.title,
    description: row.description,
    eventDate: row.event_date,
    cta: row.cta,
    imageUrl: row.image_url,
    displayOrder: row.display_order,
  }
}

export async function listLandingEvents() {
  await ensureContentTables()
  const result = await query('SELECT * FROM landing_events ORDER BY display_order, id')
  return result.rows.map(mapEvent)
}

export async function saveLandingEvent(event, id = null) {
  await ensureContentTables()
  if (id) {
    const result = await query(
      `UPDATE landing_events
       SET badge = $1, title = $2, description = $3, event_date = $4, cta = $5, image_url = $6, updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [event.badge, event.title, event.description, event.eventDate, event.cta, event.imageUrl, id],
    )
    return result.rows[0] ? mapEvent(result.rows[0]) : null
  }

  const result = await query(
    `INSERT INTO landing_events (badge, title, description, event_date, cta, image_url, display_order)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE((SELECT MAX(display_order) + 1 FROM landing_events), 0))
     RETURNING *`,
    [event.badge, event.title, event.description, event.eventDate, event.cta, event.imageUrl],
  )
  return mapEvent(result.rows[0])
}

export async function deleteLandingEvent(id) {
  await ensureContentTables()
  const result = await query('DELETE FROM landing_events WHERE id = $1', [id])
  return result.rowCount > 0
}

export async function listStaffWallets() {
  await ensureContentTables()
  const result = await query('SELECT wallet_address, created_at FROM admin_staff_wallets ORDER BY created_at')
  return result.rows.map((row) => ({ walletAddress: row.wallet_address, createdAt: row.created_at }))
}

export async function addStaffWallet(walletAddress, addedBy) {
  await ensureContentTables()
  const result = await query(
    `INSERT INTO admin_staff_wallets (wallet_address, added_by)
     VALUES ($1, $2)
     ON CONFLICT (wallet_address) DO NOTHING
     RETURNING wallet_address, created_at`,
    [walletAddress, addedBy],
  )
  return result.rows[0] ? { walletAddress: result.rows[0].wallet_address, createdAt: result.rows[0].created_at } : null
}

export async function deleteStaffWallet(walletAddress) {
  await ensureContentTables()
  const result = await query('DELETE FROM admin_staff_wallets WHERE wallet_address = $1', [walletAddress])
  return result.rowCount > 0
}