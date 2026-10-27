import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { rateLimit } from 'express-rate-limit'
import { pool, query } from '../db.js'
import { createEvmWalletChallenge, createWalletChallenge, verifyEvmWalletChallenge, verifyWalletChallenge } from '../services/walletAuth.js'
import { isAllowedFrontendOrigin } from '../utils/frontendOrigins.js'
import { requireAuth, requireAuthAllowPendingDeletion, requireEmailAuth } from '../middleware/auth.js'

const router = Router()

function requireJwtSecret(_request, response, next) {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    return response.status(503).json({
      error: 'Sign-in is unavailable because JWT_SECRET is not configured as a random string of at least 32 characters.',
    })
  }
  next()
}

async function recordLoginEvent({ userId = null, walletAddress = null, authType }) {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS user_login_events (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
        wallet_address TEXT,
        auth_type TEXT NOT NULL CHECK (auth_type IN ('email', 'wallet')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await query(
      'INSERT INTO user_login_events (user_id, wallet_address, auth_type) VALUES ($1, $2, $3)',
      [userId, walletAddress, authType],
    )
  } catch (error) {
    console.warn('Login tracking failed:', error.message)
  }
}
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler(_request, response) {
    response.status(429).json({ error: 'Too many sign-in attempts. Please wait 15 minutes and try again.' })
  },
})
let profileTableSetup

async function ensureProfileTable() {
  if (!profileTableSetup) {
    profileTableSetup = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS user_profiles (
          identity_key TEXT PRIMARY KEY,
          email TEXT,
          username TEXT,
          avatar_seed INTEGER NOT NULL DEFAULT floor(random() * 2147483647)::INTEGER,
          tracked_wallet_address TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
      await query('ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS tracked_wallet_address TEXT')
      await query('CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_username_lower_idx ON user_profiles (LOWER(username)) WHERE username IS NOT NULL')
    })().catch((error) => {
      profileTableSetup = undefined
      throw error
    })
  }
  await profileTableSetup
}

async function ensureUserProfile(identityKey, email = null) {
  await ensureProfileTable()
  const result = await query(
    `INSERT INTO user_profiles (identity_key, email)
     VALUES ($1, $2)
     ON CONFLICT (identity_key) DO UPDATE SET email = COALESCE(user_profiles.email, EXCLUDED.email)
     RETURNING identity_key, email, username, avatar_seed, tracked_wallet_address, created_at, deletion_scheduled_at`,
    [identityKey, email],
  )
  return result.rows[0]
}

function identityProfile(profile) {
  return {
    username: profile.username,
    avatarSeed: profile.avatar_seed,
    trackedWalletAddress: profile.tracked_wallet_address || null,
    deletionScheduledAt: profile.deletion_scheduled_at || null,
  }
}

async function walletProfile(identityKey) {
  try {
    const profile = await ensureUserProfile(identityKey)
    return {
      profile: identityProfile(profile),
      profileAvailable: true,
      profileCreatedAt: new Date(profile.created_at).getTime(),
      deletionScheduledAt: profile.deletion_scheduled_at,
    }
  } catch (error) {
    console.warn('Wallet profile storage unavailable:', error.message)
    return {
      profile: { username: null, avatarSeed: Math.floor(Math.random() * 2147483647) },
      profileAvailable: false,
      profileCreatedAt: null,
      deletionScheduledAt: null,
    }
  }
}

function createToken(user) {
  return jwt.sign({ email: user.email }, process.env.JWT_SECRET, { subject: String(user.id), expiresIn: '7d' })
}

router.post('/register', requireJwtSecret, authLimiter, async (request, response, next) => {
  const email = String(request.body?.email || '').trim().toLowerCase()
  const password = String(request.body?.password || '')
  const username = String(request.body?.username || '').trim()
  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 10 || password.length > 128 || !/^[A-Za-z0-9_]{3,24}$/.test(username)) {
    return response.status(400).json({ error: 'Enter a valid email, a username of 3–24 letters/numbers/underscores, and a password of 10–128 characters.' })
  }

  try {
    await ensureProfileTable()
    const passwordHash = await bcrypt.hash(password, 12)
    const result = await query(
      `WITH new_user AS (
         INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email
       ),
       new_profile AS (
         INSERT INTO user_profiles (identity_key, email, username)
         SELECT id::TEXT, email, $3 FROM new_user
         RETURNING username, avatar_seed
       )
       SELECT new_user.id, new_user.email, new_profile.username, new_profile.avatar_seed
       FROM new_user CROSS JOIN new_profile`,
      [email, passwordHash, username],
    )
    const user = result.rows[0]
    await recordLoginEvent({ userId: user.id, authType: 'email' })
    response.status(201).json({
      token: createToken(user),
      user: { id: user.id, email: user.email },
      profile: identityProfile(user),
    })
  } catch (error) {
    if (error.code === '23505' && error.constraint === 'user_profiles_username_lower_idx') {
      return response.status(409).json({ error: 'That username is already taken. Choose another one.' })
    }
    if (error.code === '23505') return response.status(409).json({ error: 'An account with this email already exists.' })
    next(error)
  }
})

router.post('/login', requireJwtSecret, authLimiter, async (request, response, next) => {
  const email = String(request.body?.email || '').trim().toLowerCase()
  const password = String(request.body?.password || '')

  try {
    const result = await query('SELECT id, email, password_hash FROM users WHERE email = $1', [email])
    const user = result.rows[0]
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return response.status(401).json({ error: 'Email or password is incorrect.' })
    }
    await recordLoginEvent({ userId: user.id, authType: 'email' })
    response.json({ token: createToken(user), user: { id: user.id, email: user.email } })
  } catch (error) {
    next(error)
  }
})

router.post('/wallet/challenge', authLimiter, (request, response) => {
  const address = String(request.body?.address || '')
  const origin = request.get('origin')
  if (!origin || !isAllowedFrontendOrigin(origin)) return response.status(403).json({ error: 'Wallet sign-in is not allowed from this origin.' })

  try {
    response.json(createWalletChallenge(address, origin))
  } catch {
    response.status(400).json({ error: 'Enter a valid Solana wallet address.' })
  }
})

router.post('/wallet/verify', requireJwtSecret, authLimiter, async (request, response, next) => {
  const address = String(request.body?.address || '')
  const nonce = String(request.body?.nonce || '')
  const signature = request.body?.signature
  if (!verifyWalletChallenge(address, nonce, signature)) {
    return response.status(401).json({ error: 'Wallet signature is invalid or expired. Request a new sign-in message.' })
  }

  await recordLoginEvent({ walletAddress: address, authType: 'wallet' })
  const result = await walletProfile(address)
  const token = jwt.sign(
    { authType: 'wallet', walletAddress: address, walletType: 'solana', profileCreatedAt: result.profileCreatedAt, iat: Math.floor(Date.now() / 1000) },
    process.env.JWT_SECRET,
    { subject: address, expiresIn: '12h' },
  )
  const { profileCreatedAt: _profileCreatedAt, ...publicResult } = result
  response.json({ token, walletAddress: address, ...publicResult })
})

router.post('/wallet/evm-challenge', authLimiter, (request, response) => {
  const address = String(request.body?.address || '')
  const chainId = Number(request.body?.chainId)
  const origin = request.get('origin')
  if (!origin || !isAllowedFrontendOrigin(origin)) return response.status(403).json({ error: 'Wallet sign-in is not allowed from this origin.' })
  try {
    response.json(createEvmWalletChallenge(address, chainId, origin))
  } catch {
    response.status(400).json({ error: 'Could not start sign-in for this EVM wallet.' })
  }
})

router.post('/wallet/evm-verify', requireJwtSecret, authLimiter, async (request, response, next) => {
  const address = String(request.body?.address || '')
  const nonce = String(request.body?.nonce || '')
  const signature = request.body?.signature
  if (!verifyEvmWalletChallenge(address, nonce, signature)) {
    return response.status(401).json({ error: 'Wallet signature is invalid or expired. Request a new sign-in message.' })
  }

  const normalizedAddress = address.toLowerCase()
  const subject = `evm:${normalizedAddress}`
  await recordLoginEvent({ walletAddress: address, authType: 'wallet' })
  const result = await walletProfile(subject)
  const token = jwt.sign(
    { authType: 'wallet', walletAddress: address, walletType: 'evm', profileCreatedAt: result.profileCreatedAt, iat: Math.floor(Date.now() / 1000) },
    process.env.JWT_SECRET,
    { subject, expiresIn: '12h' },
  )
  const { profileCreatedAt: _profileCreatedAt, ...publicResult } = result
  response.json({ token, walletAddress: address, ...publicResult })
})

router.get('/profile', requireAuthAllowPendingDeletion, async (request, response, next) => {
  try {
    const profile = await ensureUserProfile(request.user.id, request.user.email || null)
    response.json({
      profile: identityProfile(profile),
      deletionScheduledAt: profile.deletion_scheduled_at,
    })
  } catch (error) {
    next(error)
  }
})

router.put('/profile', requireAuth, async (request, response, next) => {
  const username = String(request.body?.username || '').trim()
  if (!/^[A-Za-z0-9_]{3,24}$/.test(username)) {
    return response.status(400).json({ error: 'Username must be 3–24 characters using only letters, numbers, and underscores.' })
  }

  try {
    const profile = await ensureUserProfile(request.user.id, request.user.email || null)
    const result = await query(
      `UPDATE user_profiles
       SET username = $2, updated_at = NOW()
       WHERE identity_key = $1
       RETURNING username, avatar_seed, tracked_wallet_address`,
      [request.user.id, username],
    )
    response.json({ profile: identityProfile(result.rows[0]) })
  } catch (error) {
    if (error.code === '23505') return response.status(409).json({ error: 'That username is already taken. Choose another one.' })
    next(error)
  }
})

router.post('/profile/tracked-wallet/challenge', requireEmailAuth, (request, response) => {
  const walletAddress = String(request.body?.walletAddress || '').trim()
  const walletType = request.body?.walletType
  const origin = request.get('origin')
  if (!origin || !isAllowedFrontendOrigin(origin)) return response.status(403).json({ error: 'Wallet linking is not allowed from this origin.' })

  try {
    if (walletType === 'evm') {
      const chainId = Number(request.body?.chainId)
      return response.json(createEvmWalletChallenge(
        walletAddress,
        chainId,
        origin,
        'Link this wallet to your Cobra MemeScope email account. No transaction will be sent.',
      ))
    }
    if (walletType === 'solana') {
      return response.json(createWalletChallenge(
        walletAddress,
        origin,
        'Link this wallet to your Cobra MemeScope email account. No transaction will be sent.',
      ))
    }
    return response.status(400).json({ error: 'Choose a supported Solana or EVM wallet.' })
  } catch {
    return response.status(400).json({ error: 'Enter a valid wallet address and network.' })
  }
})

router.post('/profile/tracked-wallet/verify', requireEmailAuth, async (request, response, next) => {
  const walletAddress = String(request.body?.walletAddress || '').trim()
  const nonce = String(request.body?.nonce || '')
  const walletType = request.body?.walletType
  const signature = request.body?.signature
  const verified = walletType === 'evm'
    ? verifyEvmWalletChallenge(walletAddress, nonce, signature)
    : walletType === 'solana'
      ? verifyWalletChallenge(walletAddress, nonce, signature)
      : false
  if (!verified) return response.status(401).json({ error: 'Wallet signature is invalid or expired. Request a new linking message.' })

  try {
    await ensureUserProfile(request.user.id, request.user.email || null)
    const trackedWalletAddress = walletType === 'evm' ? walletAddress.toLowerCase() : walletAddress
    await query(
      `UPDATE user_profiles
       SET tracked_wallet_address = $2, updated_at = NOW()
       WHERE identity_key = $1`,
      [request.user.id, trackedWalletAddress],
    )
    response.json({ trackedWalletAddress })
  } catch (error) {
    next(error)
  }
})

router.delete('/profile/tracked-wallet', requireEmailAuth, async (request, response, next) => {
  try {
    await ensureUserProfile(request.user.id, request.user.email || null)
    await query(
      `UPDATE user_profiles
       SET tracked_wallet_address = NULL, updated_at = NOW()
       WHERE identity_key = $1`,
      [request.user.id],
    )
    response.json({ trackedWalletAddress: null })
  } catch (error) {
    next(error)
  }
})

router.delete('/account', requireAuth, async (request, response, next) => {
  let client
  try {
    client = await pool.connect()
    await client.query('BEGIN')
    const result = await client.query(
      `UPDATE user_profiles
       SET deletion_scheduled_at = NOW() + INTERVAL '3 days', updated_at = NOW()
       WHERE identity_key = $1 AND deletion_scheduled_at IS NULL
       RETURNING deletion_scheduled_at`,
      [request.user.id],
    )
    if (!result.rowCount) {
      await client.query('ROLLBACK')
      return response.status(404).json({ error: 'The account profile could not be found.' })
    }
    await client.query('COMMIT')
    response.json({ deletionScheduledAt: result.rows[0].deletion_scheduled_at })
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK')
      } catch (rollbackError) {
        console.error('Account deletion rollback failed:', rollbackError)
      }
    }
    next(error)
  } finally {
    client?.release()
  }
})

router.post('/account/cancel-deletion', requireAuthAllowPendingDeletion, async (request, response, next) => {
  try {
    const result = await query(
      `UPDATE user_profiles
       SET deletion_scheduled_at = NULL, updated_at = NOW()
       WHERE identity_key = $1
         AND deletion_scheduled_at IS NOT NULL
         AND deletion_scheduled_at > NOW()
       RETURNING identity_key`,
      [request.user.id],
    )
    if (!result.rowCount) return response.status(409).json({ error: 'This account does not have a cancellable scheduled deletion.' })
    response.json({ cancelled: true })
  } catch (error) {
    next(error)
  }
})

export default router
