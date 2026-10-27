import { Router } from 'express'
import express from 'express'
import { rateLimit } from 'express-rate-limit'
import bs58 from 'bs58'
import { ADMIN_WALLET_ADDRESS, requireAdminWalletAuth, requireOwnerOrStaffWalletAuth, requireOwnerWalletAuth } from '../middleware/auth.js'
import { query } from '../db.js'
import { getDonorDashboard } from '../services/donorActivity.js'
import { addStaffWallet, deleteLandingEvent, deleteStaffWallet, listLandingEvents, listStaffWallets, saveLandingEvent, saveLandingEventImage } from '../services/landingContent.js'
import { saveSeasonalTheme, seasonalThemes } from '../services/siteTheme.js'

const router = Router()
const dashboardLimiter = rateLimit({ windowMs: 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false })
const eventImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const eventImageUpload = express.raw({ type: [...eventImageTypes], limit: '5mb' })

function hasValidImageSignature(contentType, image) {
  if (!Buffer.isBuffer(image)) return false
  if (contentType === 'image/jpeg') return image.length >= 3 && image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff
  if (contentType === 'image/png') return image.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  if (contentType === 'image/webp') return image.length >= 12 && image.toString('ascii', 0, 4) === 'RIFF' && image.toString('ascii', 8, 12) === 'WEBP'
  if (contentType === 'image/gif') return image.toString('ascii', 0, 3) === 'GIF'
  return false
}

router.get('/donors', dashboardLimiter, requireAdminWalletAuth, async (_request, response, next) => {
  try {
    response.set('Cache-Control', 'private, no-store')
    response.json(await getDonorDashboard())
  } catch (error) {
    next(error)
  }
})

function normalizeLandingEvent(input) {
  const event = {
    badge: String(input?.badge || '').trim(),
    title: String(input?.title || '').trim(),
    description: String(input?.description || '').trim(),
    eventDate: String(input?.eventDate || '').trim(),
    cta: String(input?.cta || '').trim(),
    imageUrl: String(input?.imageUrl || '').trim(),
  }
  if (!event.badge || event.badge.length > 60) throw new Error('Enter a badge (up to 60 characters).')
  if (!event.title || event.title.length > 140) throw new Error('Enter a title (up to 140 characters).')
  if (!event.description || event.description.length > 1000) throw new Error('Enter a description (up to 1,000 characters).')
  if (event.eventDate.length > 100) throw new Error('Event date must be 100 characters or fewer.')
  if (!event.cta || event.cta.length > 80) throw new Error('Enter button text (up to 80 characters).')
  if (event.imageUrl) {
    let imageUrl
    try { imageUrl = new URL(event.imageUrl) } catch { throw new Error('Image URL must be a valid HTTPS link.') }
    const isLocalDevelopmentUrl = imageUrl.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(imageUrl.hostname)
    if (imageUrl.protocol !== 'https:' && !isLocalDevelopmentUrl) throw new Error('Image URL must use HTTPS.')
  }
  return event
}

function isSolanaWalletAddress(address) {
  try {
    const bytes = bs58.decode(address)
    return bytes.length === 32 && bs58.encode(bytes) === address
  } catch {
    return false
  }
}

router.get('/access', requireOwnerOrStaffWalletAuth, (request, response) => {
  response.set('Cache-Control', 'private, no-store')
  response.json({ role: request.user.role, walletAddress: request.user.walletAddress })
})

router.put('/theme', requireOwnerWalletAuth, async (request, response, next) => {
  const theme = request.body?.theme
  if (!seasonalThemes.includes(theme)) {
    return response.status(400).json({ error: 'Choose a supported seasonal theme.' })
  }
  try {
    response.set('Cache-Control', 'no-store')
    response.json(await saveSeasonalTheme(theme))
  } catch (error) {
    next(error)
  }
})

router.get('/events', requireOwnerOrStaffWalletAuth, async (_request, response, next) => {
  try {
    response.set('Cache-Control', 'private, no-store')
    response.json({ events: await listLandingEvents() })
  } catch (error) { next(error) }
})

router.post('/event-images', requireOwnerOrStaffWalletAuth, eventImageUpload, async (request, response, next) => {
  const contentType = request.get('Content-Type')?.toLowerCase()
  if (!eventImageTypes.has(contentType) || !hasValidImageSignature(contentType, request.body)) {
    return response.status(400).json({ error: 'Choose a valid JPEG, PNG, WebP, or GIF image to upload.' })
  }
  try {
    const id = await saveLandingEventImage(contentType, request.body)
    response.status(201).json({ id })
  } catch (error) {
    next(error)
  }
})

router.post('/events', requireOwnerOrStaffWalletAuth, async (request, response, next) => {
  try {
    response.status(201).json(await saveLandingEvent(normalizeLandingEvent(request.body)))
  } catch (error) {
    if (error instanceof Error && !error.code) return response.status(400).json({ error: error.message })
    next(error)
  }
})

router.put('/events/:id', requireOwnerOrStaffWalletAuth, async (request, response, next) => {
  if (!/^\d+$/.test(request.params.id)) return response.status(400).json({ error: 'Invalid event id.' })
  try {
    const event = await saveLandingEvent(normalizeLandingEvent(request.body), request.params.id)
    if (!event) return response.status(404).json({ error: 'Event not found.' })
    response.json(event)
  } catch (error) {
    if (error instanceof Error && !error.code) return response.status(400).json({ error: error.message })
    next(error)
  }
})

router.delete('/events/:id', requireOwnerOrStaffWalletAuth, async (request, response, next) => {
  if (!/^\d+$/.test(request.params.id)) return response.status(400).json({ error: 'Invalid event id.' })
  try {
    if (!await deleteLandingEvent(request.params.id)) return response.status(404).json({ error: 'Event not found.' })
    response.status(204).end()
  } catch (error) { next(error) }
})

router.get('/staff', requireOwnerWalletAuth, async (_request, response, next) => {
  try { response.json({ staff: await listStaffWallets() }) } catch (error) { next(error) }
})

router.get('/invites/leaderboard', requireOwnerWalletAuth, async (request, response, next) => {
  const search = String(request.query.search || '').trim().slice(0, 100)
  const limit = Math.min(Math.max(Number.parseInt(String(request.query.limit || '50'), 10) || 50, 1), 100)
  const offset = Math.max(Number.parseInt(String(request.query.offset || '0'), 10) || 0, 0)
  try {
    const result = await query(
      `WITH all_accounts AS (
         SELECT users.id::TEXT AS identity_key,
                COALESCE(profiles.email, users.email) AS email,
                profiles.username,
                'email' AS auth_type,
                COALESCE(users.created_at, profiles.created_at) AS created_at
         FROM users
         LEFT JOIN user_profiles AS profiles ON profiles.identity_key = users.id::TEXT
         UNION ALL
         SELECT profiles.identity_key,
                profiles.email,
                profiles.username,
                'wallet' AS auth_type,
                profiles.created_at
         FROM user_profiles AS profiles
         LEFT JOIN users ON profiles.identity_key = users.id::TEXT
         WHERE users.id IS NULL
       ),
       leaderboard AS (
         SELECT accounts.identity_key,
                accounts.email,
                accounts.username,
                accounts.auth_type,
                accounts.created_at,
                COUNT(referrals.identity_key)::INTEGER AS invited_count
         FROM all_accounts AS accounts
         LEFT JOIN user_profiles AS referrals ON referrals.referred_by_identity_key = accounts.identity_key
         WHERE $1 = ''
            OR POSITION(LOWER($1) IN LOWER(COALESCE(accounts.email, ''))) > 0
            OR POSITION(LOWER($1) IN LOWER(COALESCE(accounts.username, ''))) > 0
            OR POSITION(LOWER($1) IN LOWER(accounts.identity_key)) > 0
         GROUP BY accounts.identity_key, accounts.email, accounts.username, accounts.auth_type, accounts.created_at
         HAVING COUNT(referrals.identity_key) > 0
       )
       SELECT leaderboard.*, COUNT(*) OVER() AS total_count
       FROM leaderboard
       ORDER BY invited_count DESC, created_at ASC, identity_key
       LIMIT $2 OFFSET $3`,
      [search, limit, offset],
    )
    response.set('Cache-Control', 'private, no-store')
    response.json({
      leaders: result.rows.map((row) => ({
        identityKey: row.identity_key,
        email: row.email,
        username: row.username,
        authType: row.auth_type,
        createdAt: row.created_at,
        invitedCount: row.invited_count,
      })),
      total: Number(result.rows[0]?.total_count || 0),
      limit,
      offset,
    })
  } catch (error) { next(error) }
})

router.get('/users', requireOwnerWalletAuth, async (request, response, next) => {
  const search = String(request.query.search || '').trim().slice(0, 100)
  const status = request.query.status === 'banned' ? 'banned' : 'all'
  const limit = Math.min(Math.max(Number.parseInt(String(request.query.limit || '50'), 10) || 50, 1), 100)
  const offset = Math.max(Number.parseInt(String(request.query.offset || '0'), 10) || 0, 0)
  try {
    const values = [search, status === 'banned', limit, offset]
    const result = await query(
      `WITH all_accounts AS (
         SELECT users.id::TEXT AS identity_key,
                COALESCE(profiles.email, users.email) AS email,
                profiles.username,
                'email' AS auth_type,
                COALESCE(users.created_at, profiles.created_at) AS created_at,
                profiles.banned_at,
                profiles.ban_reason,
                (SELECT COUNT(*)::INTEGER FROM user_profiles AS referrals WHERE referrals.referred_by_identity_key = users.id::TEXT) AS invited_count
         FROM users
         LEFT JOIN user_profiles AS profiles ON profiles.identity_key = users.id::TEXT
         UNION ALL
         SELECT profiles.identity_key,
                profiles.email,
                profiles.username,
                'wallet' AS auth_type,
                profiles.created_at,
                profiles.banned_at,
                profiles.ban_reason,
                (SELECT COUNT(*)::INTEGER FROM user_profiles AS referrals WHERE referrals.referred_by_identity_key = profiles.identity_key) AS invited_count
         FROM user_profiles AS profiles
         LEFT JOIN users ON profiles.identity_key = users.id::TEXT
         WHERE users.id IS NULL
       ),
       filtered_users AS (
         SELECT profiles.identity_key,
                profiles.email,
                profiles.username,
                profiles.auth_type,
                profiles.created_at,
                profiles.banned_at,
                profiles.ban_reason,
                profiles.invited_count
         FROM all_accounts AS profiles
         WHERE (NOT $2::BOOLEAN OR profiles.banned_at IS NOT NULL)
           AND (
             $1 = ''
             OR POSITION(LOWER($1) IN LOWER(COALESCE(profiles.email, ''))) > 0
             OR POSITION(LOWER($1) IN LOWER(COALESCE(profiles.username, ''))) > 0
             OR POSITION(LOWER($1) IN LOWER(profiles.identity_key)) > 0
           )
       )
       SELECT filtered_users.*, COUNT(*) OVER() AS total_count
       FROM filtered_users
       ORDER BY created_at DESC, identity_key
       LIMIT $3 OFFSET $4`,
      values,
    )
    response.set('Cache-Control', 'private, no-store')
    response.json({
      users: result.rows.map((row) => ({
        identityKey: row.identity_key,
        email: row.email,
        username: row.username,
        authType: row.auth_type,
        createdAt: row.created_at,
        bannedAt: row.banned_at,
        banReason: row.ban_reason,
        invitedCount: row.invited_count,
      })),
      total: Number(result.rows[0]?.total_count || 0),
      limit,
      offset,
    })
  } catch (error) { next(error) }
})

router.put('/users/:identityKey/ban', requireOwnerWalletAuth, async (request, response, next) => {
  const identityKey = String(request.params.identityKey || '').trim()
  const reason = String(request.body?.reason || '').trim()
  if (!identityKey || identityKey.length > 256) return response.status(400).json({ error: 'Choose a valid user account.' })
  if (!reason || reason.length > 500) return response.status(400).json({ error: 'Enter a violation reason of up to 500 characters.' })
  if (identityKey === request.user.id || identityKey === ADMIN_WALLET_ADDRESS) {
    return response.status(409).json({ error: 'The developer account cannot be banned.' })
  }
  try {
    const result = await query(
      `WITH target_account AS (
         SELECT users.id::TEXT AS identity_key, users.email
         FROM users
         WHERE users.id::TEXT = $1
         UNION ALL
         SELECT profiles.identity_key, profiles.email
         FROM user_profiles AS profiles
         WHERE profiles.identity_key = $1
           AND NOT EXISTS (SELECT 1 FROM users WHERE users.id::TEXT = $1)
       )
       INSERT INTO user_profiles (identity_key, email, banned_at, ban_reason, banned_by)
       SELECT identity_key, email, NOW(), $2, $3
       FROM target_account
       LIMIT 1
       ON CONFLICT (identity_key) DO UPDATE
       SET banned_at = NOW(), ban_reason = EXCLUDED.ban_reason, banned_by = EXCLUDED.banned_by, updated_at = NOW()
       RETURNING identity_key, email, username, banned_at, ban_reason`,
      [identityKey, reason, request.user.walletAddress],
    )
    if (!result.rowCount) return response.status(404).json({ error: 'User account not found.' })
    response.json({
      identityKey: result.rows[0].identity_key,
      email: result.rows[0].email,
      username: result.rows[0].username,
      bannedAt: result.rows[0].banned_at,
      banReason: result.rows[0].ban_reason,
    })
  } catch (error) { next(error) }
})

router.delete('/users/:identityKey/ban', requireOwnerWalletAuth, async (request, response, next) => {
  const identityKey = String(request.params.identityKey || '').trim()
  if (!identityKey || identityKey.length > 256) return response.status(400).json({ error: 'Choose a valid user account.' })
  if (identityKey === request.user.id || identityKey === ADMIN_WALLET_ADDRESS) {
    return response.status(409).json({ error: 'The developer account cannot be unbanned.' })
  }
  try {
    const result = await query(
      `UPDATE user_profiles
       SET banned_at = NULL, ban_reason = NULL, banned_by = NULL, updated_at = NOW()
       WHERE identity_key = $1 AND banned_at IS NOT NULL
       RETURNING identity_key`,
      [identityKey],
    )
    if (!result.rowCount) return response.status(404).json({ error: 'Banned user account not found.' })
    response.status(204).end()
  } catch (error) { next(error) }
})

router.post('/staff', requireOwnerWalletAuth, async (request, response, next) => {
  const walletAddress = String(request.body?.walletAddress || '').trim()
  if (!isSolanaWalletAddress(walletAddress)) return response.status(400).json({ error: 'Enter a valid Solana wallet address.' })
  if (walletAddress === request.user.walletAddress) return response.status(409).json({ error: 'The developer wallet already has owner access.' })
  try {
    const staff = await addStaffWallet(walletAddress, request.user.walletAddress)
    if (!staff) return response.status(409).json({ error: 'That wallet already has staff access.' })
    response.status(201).json(staff)
  } catch (error) { next(error) }
})

router.delete('/staff/:walletAddress', requireOwnerWalletAuth, async (request, response, next) => {
  const walletAddress = String(request.params.walletAddress || '').trim()
  if (!isSolanaWalletAddress(walletAddress)) return response.status(400).json({ error: 'Invalid Solana wallet address.' })
  try {
    if (!await deleteStaffWallet(walletAddress)) return response.status(404).json({ error: 'Staff wallet not found.' })
    response.status(204).end()
  } catch (error) { next(error) }
})

export default router