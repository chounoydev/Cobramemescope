import jwt from 'jsonwebtoken'
import { query } from '../db.js'
import { ensureContentTables } from '../services/landingContent.js'

export const ADMIN_WALLET_ADDRESS = 'J4SBuzguguPJh6uU6SiVPX4qfsUDoDbRcEPXa6R8Jbob'

async function authenticate(request, response, next, allowScheduledDeletion) {
  const authorization = request.get('authorization') || ''
  const [scheme, token] = authorization.split(' ')

  if (scheme !== 'Bearer' || !token) {
    return response.status(401).json({ error: 'Authentication required.' })
  }

  let payload
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET)
  } catch {
    return response.status(401).json({ error: 'Invalid or expired token.' })
  }

  request.user = {
    id: payload.sub,
    email: payload.email,
    authType: payload.authType || 'email',
    walletAddress: payload.walletAddress,
    walletType: payload.walletType,
  }

  try {
    if (request.user.authType === 'wallet') {
      const profile = await query('SELECT created_at, deletion_scheduled_at FROM user_profiles WHERE identity_key = $1', [request.user.id])
      const profileCreatedAt = Number(payload.profileCreatedAt)
      const issuedAt = Number(payload.iat) * 1000
      const storedCreatedAt = profile.rows[0] ? new Date(profile.rows[0].created_at).getTime() : NaN
      const sessionIsStale = Number.isFinite(profileCreatedAt)
        ? storedCreatedAt !== profileCreatedAt
        : !Number.isFinite(issuedAt) || storedCreatedAt > issuedAt + 1000
      if (!profile.rows[0] || sessionIsStale) {
        return response.status(401).json({ error: 'This account was deleted or its session is no longer valid. Sign in again.' })
      }
      if (profile.rows[0].deletion_scheduled_at && !allowScheduledDeletion) {
        return response.status(403).json({ error: 'This account is deactivated and scheduled for deletion. Cancel the deletion to restore access.' })
      }
    } else {
      const account = await query('SELECT 1 FROM users WHERE id = $1', [request.user.id])
      if (!account.rowCount) return response.status(401).json({ error: 'This account was deleted. Create a new account to continue.' })
      const profile = await query('SELECT deletion_scheduled_at FROM user_profiles WHERE identity_key = $1', [request.user.id])
      if (profile.rows[0]?.deletion_scheduled_at && !allowScheduledDeletion) {
        return response.status(403).json({ error: 'This account is deactivated and scheduled for deletion. Cancel the deletion to restore access.' })
      }
    }
    return next()
  } catch (error) {
    return next(error)
  }
}

export function requireAuth(request, response, next) {
  return authenticate(request, response, next, false)
}

export function requireAuthAllowPendingDeletion(request, response, next) {
  return authenticate(request, response, next, true)
}

export function requireWalletAuth(request, response, next) {
  return requireAuth(request, response, () => {
    if (request.user.authType !== 'wallet' || !request.user.walletAddress) {
      return response.status(403).json({ error: 'A wallet session is required.' })
    }
    return next()
  })
}

export function requireAdminWalletAuth(request, response, next) {
  return requireWalletAuth(request, response, () => {
    if (request.user.walletAddress !== ADMIN_WALLET_ADDRESS) {
      return response.status(403).json({ error: 'This dashboard is restricted to its developer wallet.' })
    }
    return next()
  })
}

export function requireOwnerWalletAuth(request, response, next) {
  return requireWalletAuth(request, response, () => {
    if (request.user.walletAddress !== ADMIN_WALLET_ADDRESS) {
      return response.status(403).json({ error: 'This action is restricted to the developer wallet.' })
    }
    request.user.role = 'owner'
    return next()
  })
}

export function requireOwnerOrStaffWalletAuth(request, response, next) {
  return requireWalletAuth(request, response, async () => {
    if (request.user.walletAddress === ADMIN_WALLET_ADDRESS) {
      request.user.role = 'owner'
      return next()
    }

    try {
      await ensureContentTables()
      const result = await query('SELECT 1 FROM admin_staff_wallets WHERE wallet_address = $1', [request.user.walletAddress])
      if (result.rowCount === 0) return response.status(403).json({ error: 'This wallet has not been granted staff access.' })
      request.user.role = 'staff'
      return next()
    } catch (error) {
      return next(error)
    }
  })
}

export function requireEmailAuth(request, response, next) {
  return requireAuth(request, response, () => {
    if (request.user.authType !== 'email') {
      return response.status(403).json({ error: 'An email account is required for this resource.' })
    }
    return next()
  })
}
