import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { InvalidContractAddressError, scanContract } from '../services/contractScanner.js'

const router = Router()
const scanLimiter = rateLimit({ windowMs: 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false })

router.post('/', scanLimiter, async (request, response, next) => {
  const address = String(request.body?.address || '').trim()
  if (address.length > 64) return response.status(400).json({ error: 'Contract address is too long.' })

  try {
    response.set('Cache-Control', 'no-store')
    response.json(await scanContract(address))
  } catch (error) {
    if (error instanceof InvalidContractAddressError) return response.status(400).json({ error: error.message })
    next(error)
  }
})

export default router