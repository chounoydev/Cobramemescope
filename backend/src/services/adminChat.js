import { query } from '../db.js'
import { ADMIN_WALLET_ADDRESS } from '../middleware/auth.js'
import { ensureContentTables } from './landingContent.js'
import bs58 from 'bs58'

let tablesReady

export async function ensureAdminChatTables() {
  if (!tablesReady) {
    tablesReady = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS admin_chat_messages (
          id BIGSERIAL PRIMARY KEY,
          sender_identity_key TEXT NOT NULL,
          sender_wallet_address TEXT NOT NULL,
          message TEXT NOT NULL DEFAULT '',
          attachment_name TEXT,
          attachment_content_type TEXT,
          attachment_data BYTEA,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT admin_chat_message_has_content CHECK (message <> '' OR attachment_data IS NOT NULL),
          CONSTRAINT admin_chat_attachment_fields_match CHECK (
            (attachment_data IS NULL AND attachment_name IS NULL AND attachment_content_type IS NULL)
            OR (attachment_data IS NOT NULL AND attachment_name IS NOT NULL AND attachment_content_type IS NOT NULL)
          )
        )
      `)
      await query('CREATE INDEX IF NOT EXISTS admin_chat_messages_created_at_idx ON admin_chat_messages (created_at, id)')
      await query('ALTER TABLE admin_chat_messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ')
      await query('ALTER TABLE admin_chat_messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ')
      await query(`
        CREATE TABLE IF NOT EXISTS community_tracked_tokens (
          mint_address TEXT PRIMARY KEY,
          source_identity_key TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
    })().catch((error) => {
      tablesReady = undefined
      throw error
    })
  }
  await tablesReady
}

function mapMessage(row) {
  return {
    id: String(row.id),
    senderIdentityKey: String(row.sender_identity_key || ''),
    senderWalletAddress: row.sender_wallet_address,
    senderName: row.username || `${row.sender_wallet_address.slice(0, 5)}…${row.sender_wallet_address.slice(-5)}`,
    senderRole: row.sender_wallet_address === ADMIN_WALLET_ADDRESS || row.is_staff ? 'admin' : 'member',
    message: row.message,
    attachmentName: row.attachment_name,
    attachmentContentType: row.attachment_content_type,
    createdAt: row.created_at,
    editedAt: row.edited_at || null,
    deletedAt: row.deleted_at || null,
  }
}

export function findSolanaMintAddresses(text) {
  const candidates = String(text || '').match(/\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g) || []
  return [...new Set(candidates.filter((candidate) => {
    try {
      const decoded = bs58.decode(candidate)
      return decoded.length >= 32 && decoded.length <= 44
    } catch {
      return false
    }
  }))]
}

export async function listCommunityTrackedTokens() {
  await ensureAdminChatTables()
  const result = await query('SELECT mint_address, created_at FROM community_tracked_tokens ORDER BY created_at DESC LIMIT 100')
  return result.rows.map((row) => ({ address: row.mint_address, createdAt: row.created_at }))
}

export async function listAdminChatMessages() {
  await ensureAdminChatTables()
  await ensureContentTables()
  const result = await query(
    `SELECT messages.id,
            messages.sender_wallet_address,
            messages.sender_identity_key,
            (messages.sender_wallet_address = '${ADMIN_WALLET_ADDRESS}' OR staff.wallet_address IS NOT NULL) AS is_staff,
            profiles.username,
            messages.message,
            messages.attachment_name,
            messages.attachment_content_type,
            messages.created_at
            , messages.edited_at
            , messages.deleted_at
     FROM (
       SELECT id,
              sender_identity_key,
              sender_wallet_address,
              message,
              attachment_name,
              attachment_content_type,
              created_at
              , edited_at
              , deleted_at
       FROM admin_chat_messages
       ORDER BY created_at DESC, id DESC
       LIMIT 100
     ) AS messages
     LEFT JOIN user_profiles AS profiles ON profiles.identity_key = messages.sender_identity_key
     LEFT JOIN admin_staff_wallets AS staff ON staff.wallet_address = messages.sender_wallet_address
     ORDER BY messages.created_at, messages.id`,
  )
  return result.rows.map(mapMessage)
}

export async function createAdminChatMessage({ identityKey, walletAddress, message, attachment = null }) {
  await ensureAdminChatTables()
  const profile = await query('SELECT username FROM user_profiles WHERE identity_key = $1', [identityKey])
  const result = await query(
    `INSERT INTO admin_chat_messages (
       sender_identity_key, sender_wallet_address, message, attachment_name, attachment_content_type, attachment_data
     )
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, sender_identity_key, sender_wallet_address, message, attachment_name, attachment_content_type, created_at`,
    [
      identityKey,
      walletAddress,
      message,
      attachment?.name || null,
      attachment?.contentType || null,
      attachment?.data || null,
    ],
  )
  for (const mintAddress of findSolanaMintAddresses(message)) {
    await query(
      'INSERT INTO community_tracked_tokens (mint_address, source_identity_key) VALUES ($1, $2) ON CONFLICT (mint_address) DO NOTHING',
      [mintAddress, identityKey],
    )
  }
  return mapMessage({ ...result.rows[0], username: profile.rows[0]?.username })
}

export async function getAdminChatAttachment(id) {
  await ensureAdminChatTables()
  const result = await query(
    `SELECT attachment_name, attachment_content_type, attachment_data
     FROM admin_chat_messages
     WHERE id = $1 AND attachment_data IS NOT NULL`,
    [id],
  )
  return result.rows[0] || null
}

export async function editAdminChatMessage(id, identityKey, message) {
  await ensureAdminChatTables()
  const result = await query(
    `UPDATE admin_chat_messages
     SET message = $2, edited_at = NOW()
     WHERE id = $1 AND sender_identity_key = $3 AND deleted_at IS NULL
     RETURNING id`,
    [id, message, identityKey],
  )
  return result.rowCount === 1
}

export async function deleteAdminChatMessage(id, identityKey) {
  await ensureAdminChatTables()
  const result = await query(
    `UPDATE admin_chat_messages
     SET deleted_at = NOW(),
         message = CASE WHEN COALESCE(message, '') <> '' THEN message ELSE 'This message was deleted.' END,
         attachment_data = NULL,
         attachment_name = NULL,
         attachment_content_type = NULL
     WHERE id = $1 AND sender_identity_key = $2 AND deleted_at IS NULL
     RETURNING id`,
    [id, identityKey],
  )
  return result.rowCount === 1
}

export async function clearAdminChatConversation() {
  await ensureAdminChatTables()
  const result = await query('DELETE FROM admin_chat_messages')
  return result.rowCount
}
