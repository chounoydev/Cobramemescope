import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import bs58 from 'bs58'
import { requireAuth, requireWalletAuth } from '../middleware/auth.js'
import { query } from '../db.js'
import { getWalletHoldings } from '../services/walletHoldings.js'

const router = Router()
const balanceLimiter = rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false })
const holdingsLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler(_request, response) {
    response.status(429).json({ error: 'Holdings refreshed too often. Please wait a moment and try again.' })
  },
})
const blockhashLimiter = rateLimit({ windowMs: 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false })
const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'
let cachedBlockhash = null
let cachedBlockhashAt = 0

router.get('/holdings', holdingsLimiter, requireAuth, async (request, response, next) => {
  if (!process.env.GOLDRUSH_API_KEY) {
    return response.status(503).json({ error: 'Wallet holdings are not configured. Set GOLDRUSH_API_KEY in the backend environment.' })
  }

  try {
    let walletAddress = request.user.walletAddress
    let walletType = request.user.walletType
    if (request.user.authType === 'email') {
      const profile = await query('SELECT tracked_wallet_address FROM user_profiles WHERE identity_key = $1', [request.user.id])
      walletAddress = profile.rows[0]?.tracked_wallet_address
      if (!walletAddress) return response.status(400).json({ error: 'Add a wallet address to your profile to track its holdings.' })
      walletType = /^0x[a-fA-F0-9]{40}$/.test(walletAddress) ? 'evm' : 'solana'
    }
    if (!walletAddress) return response.status(400).json({ error: 'A wallet address is required to load holdings.' })
    if (request.user.authType !== 'email' && request.user.authType !== 'wallet') {
      return response.status(403).json({ error: 'A signed-in account is required.' })
    }
    const result = await getWalletHoldings(walletAddress, walletType)
    response.set('Cache-Control', 'no-store')
    response.json(result)
  } catch (error) {
    next(error)
  }
})

router.get('/solana/blockhash', blockhashLimiter, async (_request, response, next) => {
  try {
    if (!cachedBlockhash || Date.now() - cachedBlockhashAt > 5_000) {
      const rpcResponse = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getLatestBlockhash', params: [{ commitment: 'confirmed' }] }),
        signal: AbortSignal.timeout(12_000),
      })
      if (!rpcResponse.ok) throw new Error('Solana RPC request failed.')
      const rpcPayload = await rpcResponse.json()
      const value = rpcPayload.result?.value
      if (rpcPayload.error || typeof value?.blockhash !== 'string') throw new Error('Solana RPC returned an invalid blockhash.')
      cachedBlockhash = { blockhash: value.blockhash, lastValidBlockHeight: value.lastValidBlockHeight }
      cachedBlockhashAt = Date.now()
    }
    response.set('Cache-Control', 'no-store')
    response.json(cachedBlockhash)
  } catch (error) {
    next(error)
  }
})

router.get('/solana/balance/:address', balanceLimiter, async (request, response, next) => {
  const address = String(request.params.address || '')
  try {
    const decoded = bs58.decode(address)
    if (decoded.length !== 32 || bs58.encode(decoded) !== address) return response.status(400).json({ error: 'Enter a valid Solana wallet address.' })
  } catch {
    return response.status(400).json({ error: 'Enter a valid Solana wallet address.' })
  }

  try {
    const rpcResponse = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [address, { commitment: 'confirmed' }] }),
      signal: AbortSignal.timeout(12_000),
    })
    if (!rpcResponse.ok) throw new Error('Solana RPC request failed.')
    const rpcPayload = await rpcResponse.json()
    const lamports = rpcPayload.result?.value
    if (rpcPayload.error || !Number.isSafeInteger(lamports) || lamports < 0) throw new Error('Solana RPC returned an invalid balance.')
    response.set('Cache-Control', 'no-store')
    response.json({ address, lamports, sol: lamports / 1_000_000_000, feeReserveLamports: 5_000 })
  } catch (error) {
    next(error)
  }
})

router.get('/balance', balanceLimiter, requireWalletAuth, async (request, response, next) => {
  try {
    const walletAddress = request.user.walletAddress
    const rpcResponse = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [walletAddress, { commitment: 'confirmed' }] }),
    })
    if (!rpcResponse.ok) throw new Error('Solana RPC request failed.')
    const rpcPayload = await rpcResponse.json()
    const lamports = rpcPayload.result?.value
    if (rpcPayload.error || !Number.isSafeInteger(lamports) || lamports < 0) throw new Error('Solana RPC returned an invalid balance.')
    response.set('Cache-Control', 'no-store')
    response.json({ walletAddress, lamports, sol: lamports / 1_000_000_000 })
  } catch (error) {
    next(error)
  }
})

export default router