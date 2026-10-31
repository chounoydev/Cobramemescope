import { pool, query } from '../db.js'

export const PROMOTION_SOL_PRICE = 0.5
const PROMOTION_PERIOD_DAYS = 21
const USDC_MINT = process.env.SOLANA_USDC_MINT || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const USDT_MINT = process.env.SOLANA_USDT_MINT || 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'

let promotionsTableSetup

export function promotionPrice(days) {
  const safeDays = Math.max(PROMOTION_PERIOD_DAYS, Math.min(365, Math.floor(Number(days) || PROMOTION_PERIOD_DAYS)))
  return Math.round((PROMOTION_PRICE_FOR_DAYS(safeDays)) * 100) / 100
}

function PROMOTION_PRICE_FOR_DAYS(days) {
  return PROMOTION_SOL_PRICE * Math.ceil(days / PROMOTION_PERIOD_DAYS)
}

export async function ensurePromotionTables() {
  if (!promotionsTableSetup) {
    promotionsTableSetup = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS token_promotions (
          id BIGSERIAL PRIMARY KEY,
          identity_key TEXT NOT NULL,
          name TEXT NOT NULL,
          symbol TEXT NOT NULL,
          chain TEXT NOT NULL DEFAULT 'solana',
          mint_address TEXT NOT NULL,
          image_url TEXT NOT NULL DEFAULT '',
          website_url TEXT NOT NULL DEFAULT '',
          social_url TEXT NOT NULL DEFAULT '',
          description TEXT NOT NULL DEFAULT '',
          days INTEGER NOT NULL CHECK (days BETWEEN 21 AND 365),
          price_sol NUMERIC(12,6) NOT NULL,
          currency TEXT NOT NULL CHECK (currency IN ('SOL', 'USDC', 'USDT')),
          payment_signature TEXT,
          status TEXT NOT NULL DEFAULT 'pending_payment'
            CHECK (status IN ('pending_payment', 'paid', 'listed', 'expired', 'rejected')),
          listed_at TIMESTAMPTZ,
          expires_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (payment_signature)
        )
      `)
      await query(`CREATE INDEX IF NOT EXISTS token_promotions_active_idx
                   ON token_promotions(status, expires_at DESC)`)
    })().catch((error) => { promotionsTableSetup = undefined; throw error })
  }
  await promotionsTableSetup
}

export function isValidPromotionAddress(address) {
  return typeof address === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address.trim())
}

export async function rpc(method, params = []) {
  const response = await fetch(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  if (!response.ok) throw new Error('Solana RPC is unavailable.')
  const payload = await response.json()
  if (payload.error) throw new Error(payload.error.message || 'Solana RPC rejected the request.')
  return payload.result
}

export async function verifyPromotionPayment({ signature, currency, expectedSol }) {
  const transaction = await rpc('getTransaction', [signature, { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }])
  if (!transaction) return false
  if (transaction.meta?.err) return false
  const recipient = (process.env.PROMOTION_SOLANA_RECEIVER || process.env.DONATION_SOLANA_ADDRESS || 'J4SBuzguguPJh6uU6SiVPX4qfsUDoDbRcEPXa6R8Jbob').trim()
  if (!recipient) return false

  if (currency === 'SOL') {
    const accountKeys = transaction.transaction.message.accountKeys.map((entry) => typeof entry === 'string' ? entry : entry.pubkey)
    const recipientIndex = accountKeys.indexOf(recipient)
    if (recipientIndex < 0) return false
    const delta = Number(transaction.meta.postBalances[recipientIndex] || 0) - Number(transaction.meta.preBalances[recipientIndex] || 0)
    const requiredLamports = Math.round(expectedSol * 1_000_000_000)
    return delta >= requiredLamports
  }

  const mint = currency === 'USDC' ? USDC_MINT : USDT_MINT
  const recipientBalances = transaction.meta?.postTokenBalances?.filter((balance) => balance.mint === mint && balance.owner === recipient)
  for (const postBalance of recipientBalances) {
    const preBalance = transaction.meta.preTokenBalances?.find((balance) => balance.accountIndex === postBalance.accountIndex && balance.mint === mint)
    const before = Number(preBalance?.uiTokenAmount?.uiAmount || 0)
    const after = Number(postBalance.uiTokenAmount?.uiAmount || 0)
    if (after - before >= expectedSol) return true
  }
  return false
}

export async function getActivePromotions() {
  await ensurePromotionTables()
  await query(`UPDATE token_promotions SET status = 'expired', updated_at = NOW()
               WHERE status = 'listed' AND expires_at <= NOW()`)
  const result = await query(`
    SELECT name, symbol, mint_address AS address, image_url AS image, chain, description,
           listed_at, expires_at
    FROM token_promotions
    WHERE status = 'listed' AND expires_at > NOW()
    ORDER BY listed_at DESC
  `)
  return result.rows
}
