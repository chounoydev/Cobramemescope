import { createPublicKey, randomBytes, verify } from 'node:crypto'
import bs58 from 'bs58'
import { verifyMessage } from 'ethers'

const challenges = new Map()
const challengeLifetimeMs = 5 * 60 * 1000
const ed25519SpkiPrefix = Buffer.from('302a300506032b6570032100', 'hex')

function decodeWalletAddress(address) {
  const publicKey = bs58.decode(address)
  if (publicKey.length !== 32 || bs58.encode(publicKey) !== address) throw new Error('Invalid Solana address.')
  return Buffer.from(publicKey)
}

export function createWalletChallenge(address, origin, purpose = 'Sign in to Cobra MemeScope. No transaction will be sent.') {
  const publicKey = decodeWalletAddress(address)
  const walletAddress = bs58.encode(publicKey)
  const nonce = randomBytes(16).toString('hex')
  const issuedAt = new Date()
  const expiresAt = new Date(issuedAt.getTime() + challengeLifetimeMs)
  const domain = new URL(origin).host
  const message = [
    `${domain} wants you to sign in with your Solana account:`,
    walletAddress,
    '',
    purpose,
    '',
    `URI: ${origin}`,
    'Version: 1',
    'Chain ID: solana:mainnet',
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt.toISOString()}`,
    `Expiration Time: ${expiresAt.toISOString()}`,
  ].join('\n')

  for (const [existingNonce, challenge] of challenges) {
    if (challenge.expiresAt <= Date.now()) challenges.delete(existingNonce)
  }
  if (challenges.size >= 10_000) challenges.delete(challenges.keys().next().value)
  challenges.set(nonce, { walletAddress, message, expiresAt: expiresAt.getTime(), type: 'solana' })

  return { nonce, message }
}

export function createEvmWalletChallenge(address, chainId, origin, purpose = 'Sign in to Cobra MemeScope. No transaction will be sent.') {
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) throw new Error('Invalid EVM address.')
  if (!Number.isSafeInteger(chainId) || chainId < 1) throw new Error('Invalid EVM chain ID.')
  const walletAddress = address.toLowerCase()
  const nonce = randomBytes(16).toString('hex')
  const issuedAt = new Date()
  const expiresAt = new Date(issuedAt.getTime() + challengeLifetimeMs)
  const domain = new URL(origin).host
  const message = [
    `${domain} wants you to sign in with your Ethereum account:`,
    walletAddress,
    '',
    purpose,
    '',
    `URI: ${origin}`,
    'Version: 1',
    `Chain ID: ${chainId}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt.toISOString()}`,
    `Expiration Time: ${expiresAt.toISOString()}`,
  ].join('\n')

  for (const [existingNonce, challenge] of challenges) {
    if (challenge.expiresAt <= Date.now()) challenges.delete(existingNonce)
  }
  if (challenges.size >= 10_000) challenges.delete(challenges.keys().next().value)
  challenges.set(nonce, { walletAddress, message, expiresAt: expiresAt.getTime(), type: 'evm' })

  return { nonce, message }
}

export function verifyWalletChallenge(address, nonce, signature) {
  const challenge = challenges.get(nonce)
  challenges.delete(nonce)
  if (!challenge || challenge.type !== 'solana' || challenge.expiresAt <= Date.now() || challenge.walletAddress !== address) return false
  if (!Array.isArray(signature) || signature.length !== 64 || signature.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)) return false

  try {
    const key = createPublicKey({
      key: Buffer.concat([ed25519SpkiPrefix, decodeWalletAddress(address)]),
      format: 'der',
      type: 'spki',
    })
    return verify(null, Buffer.from(challenge.message, 'utf8'), key, Buffer.from(signature))
  } catch {
    return false
  }
}

export function verifyEvmWalletChallenge(address, nonce, signature) {
  const challenge = challenges.get(nonce)
  challenges.delete(nonce)
  if (!challenge || challenge.type !== 'evm' || challenge.expiresAt <= Date.now() || challenge.walletAddress !== address.toLowerCase()) return false
  if (typeof signature !== 'string' || !/^0x[a-fA-F0-9]{130}$/.test(signature)) return false

  try {
    return verifyMessage(challenge.message, signature).toLowerCase() === challenge.walletAddress
  } catch {
    return false
  }
}