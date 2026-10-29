import { query } from '../db.js'

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
    senderWalletAddress: row.sender_wallet_address,
    senderName: row.username || `${row.sender_wallet_address.slice(0, 5)}…${row.sender_wallet_address.slice(-5)}`,
    message: row.message,
    attachmentName: row.attachment_name,
    attachmentContentType: row.attachment_content_type,
    createdAt: row.created_at,
  }
}

export async function listAdminChatMessages() {
  await ensureAdminChatTables()
  const result = await query(
    `SELECT messages.id,
            messages.sender_wallet_address,
            profiles.username,
            messages.message,
            messages.attachment_name,
            messages.attachment_content_type,
            messages.created_at
     FROM (
       SELECT id,
              sender_identity_key,
              sender_wallet_address,
              message,
              attachment_name,
              attachment_content_type,
              created_at
       FROM admin_chat_messages
       ORDER BY created_at DESC, id DESC
       LIMIT 100
     ) AS messages
     LEFT JOIN user_profiles AS profiles ON profiles.identity_key = messages.sender_identity_key
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
     RETURNING id, sender_wallet_address, message, attachment_name, attachment_content_type, created_at`,
    [
      identityKey,
      walletAddress,
      message,
      attachment?.name || null,
      attachment?.contentType || null,
      attachment?.data || null,
    ],
  )
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
