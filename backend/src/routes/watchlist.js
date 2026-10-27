import { Router } from 'express'
import { requireEmailAuth } from '../middleware/auth.js'
import { query } from '../db.js'

const router = Router()
const supportedCoinIds = new Set([
  'dogecoin', 'shiba-inu', 'pepe', 'dogwifcoin', 'bonk', 'floki',
  'memecoin', 'popcat', 'book-of-meme', 'mog-coin', 'brett', 'turbo',
])

router.use(requireEmailAuth)

router.get('/', async (request, response, next) => {
  try {
    const result = await query('SELECT coin_id FROM watchlist WHERE user_id = $1 ORDER BY created_at DESC', [request.user.id])
    response.json({ coinIds: result.rows.map((row) => row.coin_id) })
  } catch (error) {
    next(error)
  }
})

router.post('/', async (request, response, next) => {
  const coinId = String(request.body?.coinId || '')
  if (!supportedCoinIds.has(coinId)) return response.status(400).json({ error: 'Unsupported coin.' })

  try {
    await query('INSERT INTO watchlist (user_id, coin_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [request.user.id, coinId])
    response.status(201).json({ coinId })
  } catch (error) {
    next(error)
  }
})

router.delete('/:coinId', async (request, response, next) => {
  try {
    await query('DELETE FROM watchlist WHERE user_id = $1 AND coin_id = $2', [request.user.id, request.params.coinId])
    response.status(204).end()
  } catch (error) {
    next(error)
  }
})

export default router
