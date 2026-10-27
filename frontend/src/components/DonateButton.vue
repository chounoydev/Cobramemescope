<script setup lang="ts">
import { computed, ref } from 'vue'
import { PublicKey, SystemProgram, Transaction } from '@solana/web3.js'
import { fetchSolanaBlockhash, fetchSolanaDonationBalance } from '../lib/api'

type WalletRequest = (args: { method: string; params?: unknown[] }) => Promise<unknown>
type SolanaDonationProvider = {
  isPhantom?: boolean
  connect: () => Promise<{ publicKey?: { toString: () => string } }>
  signAndSendTransaction?: (transaction: Transaction, options?: { preflightCommitment?: 'confirmed' }) => Promise<string | { signature: string }>
}
type EvmDonationProvider = {
  request: WalletRequest
  providers?: EvmDonationProvider[]
}
type DonationChain = {
  id: string
  label: string
  symbol: string
  chainId?: string
  rpcUrl?: string
  explorer?: string
  enabled: boolean
}
type DonationReceipt = {
  chain: string
  symbol: string
  amount: string
  signature: string
  explorerUrl: string
  createdAt: string
}
type DonationFailure = {
  chain: string
  symbol: string
  amount: string
  message: string
  createdAt: string
}

const emit = defineEmits<{
  transaction: [receipt: DonationReceipt]
  'transaction-failed': [failure: DonationFailure]
}>()

const solanaRecipient = 'J4SBuzguguPJh6uU6SiVPX4qfsUDoDbRcEPXa6R8Jbob'
const evmRecipient = (import.meta.env.VITE_DONATION_EVM_ADDRESS || '').trim()
const evmAddressValid = /^0x[a-fA-F0-9]{40}$/.test(evmRecipient)

const chains: DonationChain[] = [
  { id: 'solana', label: 'Solana', symbol: 'SOL', explorer: 'https://solscan.io/tx/', enabled: true },
  { id: 'ethereum', label: 'Ethereum', symbol: 'ETH', chainId: '0x1', rpcUrl: 'https://cloudflare-eth.com', explorer: 'https://etherscan.io/tx/', enabled: evmAddressValid },
  { id: 'bnb', label: 'BNB Chain', symbol: 'BNB', chainId: '0x38', rpcUrl: 'https://bsc-dataseed.binance.org', explorer: 'https://bscscan.com/tx/', enabled: evmAddressValid },
  { id: 'base', label: 'Base', symbol: 'ETH', chainId: '0x2105', rpcUrl: 'https://mainnet.base.org', explorer: 'https://basescan.org/tx/', enabled: evmAddressValid },
  { id: 'arbitrum', label: 'Arbitrum', symbol: 'ETH', chainId: '0xa4b1', rpcUrl: 'https://arb1.arbitrum.io/rpc', explorer: 'https://arbiscan.io/tx/', enabled: evmAddressValid },
  { id: 'optimism', label: 'Optimism', symbol: 'ETH', chainId: '0xa', rpcUrl: 'https://mainnet.optimism.io', explorer: 'https://optimistic.etherscan.io/tx/', enabled: evmAddressValid },
  { id: 'polygon', label: 'Polygon', symbol: 'POL', chainId: '0x89', rpcUrl: 'https://polygon-rpc.com', explorer: 'https://polygonscan.com/tx/', enabled: evmAddressValid },
  { id: 'avalanche', label: 'Avalanche', symbol: 'AVAX', chainId: '0xa86a', rpcUrl: 'https://api.avax.network/ext/bc/C/rpc', explorer: 'https://snowtrace.io/tx/', enabled: evmAddressValid },
]

const open = ref(false)
const selectedChainId = ref('solana')
const amount = ref('')
const submitting = ref(false)
const errorMessage = ref('')
const transactionHash = ref('')
const transactionExplorerUrl = ref('')

const selectedChain = computed<DonationChain>(() => chains.find((chain) => chain.id === selectedChainId.value) || chains[0]!)
const recipient = computed(() => selectedChain.value.id === 'solana' ? solanaRecipient : evmRecipient)
const maximumDecimals = computed(() => selectedChain.value.id === 'solana' ? 9 : 18)
const validAmount = computed(() => {
  if (!/^\d+(\.\d+)?$/.test(amount.value) || Number(amount.value) <= 0) return false
  return (amount.value.split('.')[1]?.length || 0) <= maximumDecimals.value
})
function closeDialog() {
  open.value = false
  errorMessage.value = ''
  transactionHash.value = ''
  transactionExplorerUrl.value = ''
}

function amountToWei(value: string) {
  const [whole = '0', fraction = ''] = value.split('.')
  if (fraction.length > 18) throw new Error('This network supports up to 18 decimal places.')
  const paddedFraction = fraction.padEnd(18, '0')
  return `0x${(BigInt(whole) * 10n ** 18n + BigInt(paddedFraction || '0')).toString(16)}`
}

function amountToLamports(value: string) {
  const [whole = '0', fraction = ''] = value.split('.')
  if (fraction.length > 9) throw new Error('SOL supports up to 9 decimal places.')
  const lamports = BigInt(whole) * 1_000_000_000n + BigInt(fraction.padEnd(9, '0') || '0')
  if (lamports > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('The SOL amount is too large to process safely.')
  return Number(lamports)
}

async function sendSolanaDonation() {
  const browser = window as Window & { phantom?: { solana?: SolanaDonationProvider }; solana?: SolanaDonationProvider }
  const provider = browser.phantom?.solana || (browser.solana?.isPhantom ? browser.solana : undefined)
  if (!provider?.signAndSendTransaction) throw new Error('A compatible Solana wallet was not detected. Install or enable Phantom, then try again.')

  const connection = await provider.connect()
  const sender = connection.publicKey?.toString()
  if (!sender) throw new Error('Connect a Solana account in Phantom to continue.')

  const lamports = amountToLamports(amount.value)
  const balance = await fetchSolanaDonationBalance(sender)
  const requiredLamports = lamports + balance.feeReserveLamports
  if (balance.lamports < requiredLamports) {
    const message = balance.lamports === 0
      ? "You don't have enough SOL to donate. Your balance is 0 SOL, and SOL is also needed to pay the network fee."
      : `You don't have enough SOL to donate ${amount.value} SOL and cover the network fee. Your available balance is ${balance.sol.toFixed(6)} SOL.`
    throw new Error(message)
  }

  const blockhash = await fetchSolanaBlockhash()
  const senderKey = new PublicKey(sender)
  const transaction = new Transaction({ feePayer: senderKey, recentBlockhash: blockhash }).add(
    SystemProgram.transfer({
      fromPubkey: senderKey,
      toPubkey: new PublicKey(solanaRecipient),
      lamports,
    }),
  )
  const result = await provider.signAndSendTransaction(transaction, { preflightCommitment: 'confirmed' })
  const signature = typeof result === 'string' ? result : (result as { signature?: string })?.signature
  if (!signature) throw new Error('Phantom did not return a transaction signature.')
  transactionHash.value = signature
}

function getEvmProvider() {
  const browser = window as Window & { ethereum?: EvmDonationProvider; phantom?: { ethereum?: EvmDonationProvider } }
  const injected = browser.ethereum?.providers?.length ? browser.ethereum.providers : browser.ethereum ? [browser.ethereum] : []
  return [...injected, ...(browser.phantom?.ethereum ? [browser.phantom.ethereum] : [])].find((provider) => typeof provider.request === 'function')
}

async function switchToChain(provider: EvmDonationProvider, chain: DonationChain) {
  if (!chain.chainId || !chain.rpcUrl) throw new Error('This network is not configured for donations.')
  const currentChain = String(await provider.request({ method: 'eth_chainId' }))
  if (currentChain.toLowerCase() === chain.chainId.toLowerCase()) return

  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chain.chainId }] })
  } catch (error) {
    if ((error as { code?: number }).code !== 4902) throw error
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: chain.chainId,
        chainName: chain.label,
        nativeCurrency: { name: chain.symbol, symbol: chain.symbol, decimals: 18 },
        rpcUrls: [chain.rpcUrl],
        blockExplorerUrls: chain.explorer ? [chain.explorer.replace(/\/tx\/$/, '')] : undefined,
      }],
    })
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chain.chainId }] })
  }
  const activeChain = String(await provider.request({ method: 'eth_chainId' }))
  if (activeChain.toLowerCase() !== chain.chainId.toLowerCase()) throw new Error(`Switch your wallet to ${chain.label} to continue.`)
}

async function sendEvmDonation() {
  const ethereum = getEvmProvider()
  if (!ethereum) throw new Error('No EVM wallet was detected. Connect MetaMask or another EVM wallet.')
  const accounts = await ethereum.request({ method: 'eth_requestAccounts' }) as string[]
  if (!accounts?.[0]) throw new Error('Select a wallet account to continue.')
  await switchToChain(ethereum, selectedChain.value)
  const result = await ethereum.request({
    method: 'eth_sendTransaction',
    params: [{ from: accounts[0], to: evmRecipient, value: amountToWei(amount.value) }],
  })
  if (typeof result !== 'string') throw new Error('The wallet did not return a transaction reference.')
  transactionHash.value = result
}

async function donate() {
  errorMessage.value = ''
  transactionHash.value = ''
  transactionExplorerUrl.value = ''
  if (!validAmount.value) {
    errorMessage.value = `Enter an amount greater than zero with up to ${maximumDecimals.value} decimal places.`
    return
  }
  if (!selectedChain.value.enabled) {
    errorMessage.value = 'This network is not enabled until its receiving wallet is configured.'
    return
  }

  submitting.value = true
  try {
    if (selectedChain.value.id === 'solana') await sendSolanaDonation()
    else await sendEvmDonation()
    const chain = selectedChain.value
    const signature = transactionHash.value
    const explorerUrl = `${chain.explorer || 'https://solscan.io/tx/'}${encodeURIComponent(signature)}`
    transactionExplorerUrl.value = explorerUrl
    emit('transaction', {
      chain: chain.label,
      symbol: chain.symbol,
      amount: amount.value,
      signature,
      explorerUrl,
      createdAt: new Date().toISOString(),
    })
  } catch (error) {
    const cancelled = (error as { code?: number }).code === 4001
    errorMessage.value = cancelled
      ? 'Donation cancelled in your wallet. No funds were sent.'
      : error instanceof Error ? error.message : 'The donation could not be sent.'
    if (!cancelled) {
      emit('transaction-failed', {
        chain: selectedChain.value.label,
        symbol: selectedChain.value.symbol,
        amount: amount.value,
        message: errorMessage.value,
        createdAt: new Date().toISOString(),
      })
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <button class="donate-trigger" type="button" @click="open = true"><span>+</span> DONATE</button>
  <div v-if="open" class="donate-overlay" @click.self="closeDialog" @keydown.esc="closeDialog">
    <section class="donate-dialog" role="dialog" aria-modal="true" aria-labelledby="donate-title">
      <header class="donate-head"><div><span>SUPPORT THE PROJECT</span><h2 id="donate-title">Send a donation</h2></div><button type="button" aria-label="Close donation dialog" @click="closeDialog">×</button></header>
      <p class="donate-intro">Choose a network and amount. Your wallet will show the recipient, network fee, and final confirmation before anything is sent.</p>
      <label class="donate-label" for="donation-chain">NETWORK</label>
      <select id="donation-chain" v-model="selectedChainId" class="donate-select">
        <option v-for="chain in chains" :key="chain.id" :value="chain.id" :disabled="!chain.enabled">{{ chain.label }} · {{ chain.symbol }}{{ chain.enabled ? '' : ' · EVM wallet address required' }}</option>
      </select>
      <label class="donate-label amount-label" for="donation-amount">AMOUNT <span>{{ selectedChain.symbol }}</span></label>
      <div class="donate-amount"><input id="donation-amount" v-model="amount" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" placeholder="0.00" /><span>{{ selectedChain.symbol }}</span></div>
      <div class="donate-recipient"><span>RECIPIENT</span><code>{{ recipient }}</code><small>{{ selectedChain.id === 'solana' ? 'Developer wallet · Solana' : 'Developer wallet · EVM' }}</small></div>
      <p v-if="selectedChain.id !== 'solana' && !evmAddressValid" class="donate-config-note">EVM donations need a separate recipient address. Set <code>VITE_DONATION_EVM_ADDRESS</code> in <code>frontend/.env</code> and restart Vite to enable these networks.</p>
      <p v-if="errorMessage" class="donate-error" role="alert">{{ errorMessage }}</p>
      <div v-if="transactionHash" class="donate-success" role="status"><span>✓</span><div><strong>Transaction submitted</strong><a :href="transactionExplorerUrl" target="_blank" rel="noreferrer">View transaction ↗</a></div></div>
      <button v-else class="donate-submit" type="button" :disabled="submitting || !selectedChain.enabled || !validAmount" @click="donate">{{ submitting ? 'WAITING FOR WALLET…' : 'CONTINUE TO WALLET' }}<span>↗</span></button>
      <p class="donate-disclaimer">Donations are voluntary and irreversible after confirmation. Network fees are paid separately by you. Only donate an amount you are comfortable losing.</p>
    </section>
  </div>
</template>

<style scoped>
.donate-trigger { display: flex; height: 32px; align-items: center; gap: 6px; padding: 0 11px; border: 1px solid #cdd6bd; background: #edf2df; color: #405333; font-family: 'DM Mono', monospace; font-size: 9px; font-weight: 700; }.donate-trigger:hover { background: #e0e9cc; }.donate-trigger span { font-size: 16px; line-height: 1; }
.donate-overlay { position: fixed; inset: 0; z-index: 30; display: grid; place-items: center; overflow-y: auto; padding: 18px; background: rgb(20 27 20 / 58%); backdrop-filter: blur(3px); }.donate-dialog { width: min(100%, 440px); padding: 22px; border: 1px solid #dce2d6; background: #fff; box-shadow: 0 20px 70px rgb(0 0 0 / 25%); }.donate-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }.donate-head > div > span,.donate-label,.donate-recipient > span { color: #80897b; font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: .6px; }.donate-head h2 { margin-top: 5px; color: #20261f; font-family: Manrope, sans-serif; font-size: 22px; }.donate-head button { width: 30px; height: 30px; border: 1px solid #e2e6dd; background: #f7f8f4; color: #5f6959; font-size: 20px; }.donate-intro { margin: 13px 0 20px; color: #697265; font-size: 13px; line-height: 1.6; }.donate-label { display: flex; justify-content: space-between; margin-bottom: 7px; }.donate-select,.donate-amount { width: 100%; height: 45px; border: 1px solid #dce1d7; background: #fafbf8; color: #333b30; }.donate-select { padding: 0 11px; font-size: 13px; }.amount-label { margin-top: 16px; }.amount-label span { color: #57683f; }.donate-amount { display: flex; align-items: center; padding: 0 11px; }.donate-amount input { width: 100%; height: 100%; border: 0; outline: 0; background: transparent; color: #20261f; font-family: 'DM Mono', monospace; font-size: 18px; }.donate-amount > span { color: #637151; font-family: 'DM Mono', monospace; font-size: 12px; }.donate-recipient { display: grid; gap: 5px; margin-top: 15px; padding: 11px; background: #f6f8f1; }.donate-recipient code { overflow-wrap: anywhere; color: #394432; font-size: 11px; }.donate-recipient small { color: #828a7c; font-size: 10px; }.donate-config-note,.donate-error { margin-top: 12px; color: #8b641d; font-size: 11px; line-height: 1.5; }.donate-error { color: #a33b32; }.donate-success { display: flex; align-items: center; gap: 10px; margin-top: 14px; padding: 11px; background: #edf4e5; color: #4e6b35; }.donate-success > span { font-size: 18px; }.donate-success strong,.donate-success a { display: block; font-size: 11px; }.donate-success a { margin-top: 3px; color: #53683f; }.donate-submit { display: flex; width: 100%; height: 45px; align-items: center; justify-content: space-between; margin-top: 16px; padding: 0 13px; background: #222921; color: #f6f8f2; font-family: 'DM Mono', monospace; font-size: 10px; font-weight: 700; }.donate-submit span { color: #dbf46a; font-size: 16px; }.donate-submit:disabled { cursor: not-allowed; opacity: .5; }.donate-disclaimer { margin-top: 12px; color: #82897f; font-size: 10px; line-height: 1.55; }
:global(.dark-mode) .donate-overlay { background: rgb(3 7 4 / 78%); }
:global(.dark-mode) .donate-dialog { border-color: #d7dfcf; background: #f2f5ed; color: #20271f; }
:global(.dark-mode) .donate-head > div > span,
:global(.dark-mode) .donate-label,
:global(.dark-mode) .donate-recipient > span { color: #596451; }
:global(.dark-mode) .donate-intro { color: #4f594b; }
:global(.dark-mode) .donate-select,
:global(.dark-mode) .donate-amount { border-color: #c7d0bf; background: #fff; color: #20271f; }
:global(.dark-mode) .donate-amount input { color: #20271f; }
:global(.dark-mode) .donate-recipient { background: #e4ebdc; }
:global(.dark-mode) .donate-recipient code { color: #283326; }
:global(.dark-mode) .donate-recipient small,
:global(.dark-mode) .donate-disclaimer { color: #5f695a; }
:global(.dark-mode) .donate-submit { border: 1px solid #b8c79f; background: #dce9c9; color: #24301f; }
:global(.dark-mode) .donate-submit span { color: #48633a; }
:global(.dark-mode) .donate-submit:disabled { background: #d8ddd1; color: #636b5d; opacity: 1; }
.donate-submit { height: 52px; border: 1px solid #194a2a; background: #245c35; color: #fff; box-shadow: 0 3px 0 #173d23; cursor: pointer; font-size: 12px; letter-spacing: .4px; transition: background-color .15s ease, transform .15s ease, box-shadow .15s ease; }
.donate-submit span { color: #d9f99d; }
.donate-submit:hover:not(:disabled) { background: #194b2a; box-shadow: 0 4px 0 #12351e; transform: translateY(-1px); }
.donate-submit:active:not(:disabled) { box-shadow: 0 1px 0 #12351e; transform: translateY(1px); }
.donate-submit:focus-visible { outline: 3px solid #a3e635; outline-offset: 3px; }
.donate-submit:disabled { border-color: #405443; background: #526653; color: #fff; box-shadow: none; cursor: not-allowed; opacity: 1; }
:global(.dark-mode) .donate-submit { border-color: #194a2a; background: #245c35; color: #fff; }
:global(.dark-mode) .donate-submit span { color: #d9f99d; }
:global(.dark-mode) .donate-submit:hover:not(:disabled) { background: #194b2a; }
:global(.dark-mode) .donate-submit:disabled { border-color: #405443; background: #526653; color: #fff; }
@media (max-width: 600px) { .donate-overlay { align-items: end; padding: 0; }.donate-dialog { width: 100%; padding: 20px 17px max(18px, env(safe-area-inset-bottom)); }.donate-head h2 { font-size: 20px; } }
</style>