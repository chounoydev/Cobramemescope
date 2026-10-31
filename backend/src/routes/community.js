import express from 'express'
import { rateLimit } from 'express-rate-limit'
import { requireAuth } from '../middleware/auth.js'
import { createAdminChatMessage, deleteAdminChatMessage, editAdminChatMessage, getAdminChatAttachment, listAdminChatMessages } from '../services/adminChat.js'
import { hasValidChatAttachment } from '../utils/chatAttachments.js'

const router = express.Router()
const chatLimiter = rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false })
const attachmentTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const attachmentUpload = express.raw({ type: [...attachmentTypes], limit: '10mb' })

router.get('/chat/messages', chatLimiter, async (_request, response, next) => {
  try {
    response.set('Cache-Control', 'no-store')
    response.json({ messages: await listAdminChatMessages() })
  } catch (error) {
    next(error)
  }
})

router.post('/chat/messages', chatLimiter, requireAuth, async (request, response, next) => {
  const message = String(request.body?.message || '').trim()
  if (!message || message.length > 2000) {
    return response.status(400).json({ error: 'Write a message of 1–2,000 characters.' })
  }
  try {
    response.status(201).json({
      message: await createAdminChatMessage({
        identityKey: request.user.id,
        walletAddress: request.user.walletAddress || `user-${request.user.id}`,
        message,
      }),
    })
  } catch (error) {
    next(error)
  }
})

router.post('/chat/attachments', chatLimiter, requireAuth, attachmentUpload, async (request, response, next) => {
  const contentType = request.get('Content-Type')?.split(';', 1)[0].trim().toLowerCase()
  const message = String(request.query.message || '').trim()
  const name = String(request.get('X-File-Name') || '').trim().slice(0, 180)
  if (!attachmentTypes.has(contentType) || !hasValidChatAttachment(contentType, request.body) || !name || message.length > 2000) {
    return response.status(400).json({ error: 'Upload a valid JPEG, PNG, WebP, or GIF image.' })
  }
  try {
    response.status(201).json({
      message: await createAdminChatMessage({
        identityKey: request.user.id,
        walletAddress: request.user.walletAddress || `user-${request.user.id}`,
        message,
        attachment: { name, contentType, data: request.body },
      }),
    })
  } catch (error) {
    next(error)
  }
})

router.patch('/chat/messages/:id', chatLimiter, requireAuth, async (request, response, next) => {
  const id = String(request.params.id)
  const message = String(request.body?.message || '').trim()
  if (!/^\d+$/.test(id)) return response.status(400).json({ error: 'Invalid message id.' })
  if (!message || message.length > 2000) return response.status(400).json({ error: 'Write a message of 1–2,000 characters.' })
  try {
    if (!await editAdminChatMessage(id, request.user.id, message)) {
      return response.status(404).json({ error: 'Message not found or you cannot edit it.' })
    }
    const messageEntry = (await listAdminChatMessages()).find((entry) => entry.id === id)
    response.json({ message: messageEntry })
  } catch (error) {
    next(error)
  }
})

router.delete('/chat/messages/:id', chatLimiter, requireAuth, async (request, response, next) => {
  const id = String(request.params.id)
  if (!/^\d+$/.test(id)) return response.status(400).json({ error: 'Invalid message id.' })
  try {
    if (!await deleteAdminChatMessage(id, request.user.id)) {
      return response.status(404).json({ error: 'Message not found or you cannot delete it.' })
    }
    response.status(204).end()
  } catch (error) {
    next(error)
  }
})

router.get('/chat/messages/:id/attachment', chatLimiter, async (request, response, next) => {
  if (!/^\d+$/.test(request.params.id)) return response.status(400).json({ error: 'Invalid attachment id.' })
  try {
    const attachment = await getAdminChatAttachment(request.params.id)
    if (!attachment) return response.status(404).json({ error: 'Attachment not found.' })
    response.set({
      'Cache-Control': 'public, max-age=300',
      'Content-Type': attachment.attachment_content_type,
      'Content-Length': attachment.attachment_data.length,
    })
    response.send(attachment.attachment_data)
  } catch (error) {
    next(error)
  }
})

export default router
