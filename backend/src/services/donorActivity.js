import { ADMIN_WALLET_ADDRESS } from '../middleware/auth.js'
import { getLoginStats } from './loginStats.js'

const lamportsPerSol = 1_000_000_000
const scanLimit = 100
const donationWindowMs = 30 * 24 * 60 * 60 * 1000
const cacheTtlMs = 30_000
const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'

let cachedDashboard = null
let cachedAt = 0

async function getOptionalLoginStats() {
  try {
    return { loginStats: await getLoginStats(), analyticsError: null }
  } catch (error) {
    console.warn('Usage analytics unavailable:', error.message)
    return { loginStats: null, analyticsError: 'Usage analytics are unavailable. Check the backend database connection.' }
  }
}

async function rpc(method, params) {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) throw new Error('Solana RPC request failed.')
  const payload = await response.json()
  if (payload.error) throw new Error('Solana RPC returned an error.')
  return payload.result
}

function inboundTransfers(transaction, signature) {
  const message = transaction.transaction?.message
  const instructions = [
    ...(message?.instructions || []),
    ...(transaction.meta?.innerInstructions || []).flatMap((group) => group.instructions || []),
  ]
  const transfers = []

  instructions.forEach((instruction, index) => {
    const parsed = instruction.parsed
    const info = parsed?.info
    if (instruction.program !== 'system' || !['transfer', 'transferWithSeed'].includes(parsed?.type)) return
    if (info.destination !== ADMIN_WALLET_ADDRESS || !info.source || info.source === ADMIN_WALLET_ADDRESS) return
    const lamports = Number(info.lamports)
    if (!Number.isSafeInteger(lamports) || lamports <= 0) return

    transfers.push({
      signature,
      donor: info.source,
      lamports,
      timestamp: Number(transaction.blockTime || 0) * 1000,
    })
  })

  return transfers
}

async function fetchTransaction(row) {
  if (row.err) return []
  try {
    const transaction = await rpc('getTransaction', [row.signature, { commitment: 'confirmed', encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }])
    return transaction ? inboundTransfers(transaction, row.signature) : []
  } catch {
    return []
  }
}

export async function getDonorDashboard() {
  if (cachedDashboard && Date.now() - cachedAt < cacheTtlMs) {
    return { ...cachedDashboard, ...await getOptionalLoginStats(), updatedAt: new Date().toISOString() }
  }

  const signatures = await rpc('getSignaturesForAddress', [ADMIN_WALLET_ADDRESS, { commitment: 'confirmed', limit: scanLimit }])
  const transfers = []
  for (let index = 0; index < signatures.length; index += 5) {
    const batch = await Promise.all(signatures.slice(index, index + 5).map(fetchTransaction))
    transfers.push(...batch.flat())
  }

  const now = Date.now()
  const recent = transfers
    .filter((transfer) => transfer.timestamp > 0 && now - transfer.timestamp <= donationWindowMs)
    .sort((left, right) => right.timestamp - left.timestamp)
  const donors = new Map()

  for (const transfer of recent) {
    const donor = donors.get(transfer.donor) || { address: transfer.donor, lamports: 0, transferCount: 0, lastSeen: transfer.timestamp }
    donor.lamports += transfer.lamports
    donor.transferCount += 1
    donor.lastSeen = Math.max(donor.lastSeen, transfer.timestamp)
    donors.set(transfer.donor, donor)
  }

  const totalLamports = recent.reduce((total, transfer) => total + transfer.lamports, 0)
  const analytics = await getOptionalLoginStats()

  cachedDashboard = {
    ownerAddress: ADMIN_WALLET_ADDRESS,
    windowDays: 30,
    scannedTransactions: signatures.length,
    decodedTransfers: transfers.length,
    activeDonors: donors.size,
    totalSol: totalLamports / lamportsPerSol,
    topDonors: [...donors.values()]
      .sort((left, right) => right.lamports - left.lamports)
      .slice(0, 10)
      .map((donor, index) => ({
        rank: index + 1,
        address: donor.address,
        totalSol: donor.lamports / lamportsPerSol,
        transferCount: donor.transferCount,
        lastSeen: new Date(donor.lastSeen).toISOString(),
      })),
    recentTransfers: recent.slice(0, 20).map((transfer) => ({
      signature: transfer.signature,
      donor: transfer.donor,
      sol: transfer.lamports / lamportsPerSol,
      timestamp: new Date(transfer.timestamp).toISOString(),
    })),
    ...analytics,
    updatedAt: new Date(now).toISOString(),
  }
  cachedAt = now
  return cachedDashboard
}