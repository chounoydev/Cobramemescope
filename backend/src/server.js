import './env.js'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { timingSafeEqual } from 'node:crypto'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { pool } from './db.js'
import authRoutes from './routes/auth.js'
import marketRoutes from './routes/market.js'
import watchlistRoutes from './routes/watchlist.js'
import walletRoutes from './routes/wallet.js'
import scanRoutes from './routes/scan.js'
import adminRoutes from './routes/admin.js'
import analyticsRoutes from './routes/analytics.js'
import contentRoutes from './routes/content.js'
import assistantRoutes from './routes/assistant.js'
import { isAllowedFrontendOrigin } from './utils/frontendOrigins.js'
import { fileURLToPath } from 'node:url'
import { processScheduledAccountDeletions } from './services/accountDeletion.js'

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be set to a random string of at least 32 characters.')
}

const app = express()
app.disable('x-powered-by')
app.use(helmet())
app.use(cors({
  origin(origin, callback) {
    callback(null, !origin || isAllowedFrontendOrigin(origin))
  },
}))
app.use(express.json({ limit: '16kb' }))

app.get('/api/health', async (_request, response) => {
  if (!process.env.DATABASE_URL) {
    return response.status(503).json({
      status: 'error',
      database: 'unavailable',
      error: 'DATABASE_URL is not configured in the backend environment.',
    })
  }

  try {
    await pool.query('SELECT 1')
    response.json({ status: 'ok', database: 'connected' })
  } catch (error) {
    console.error('Database health check failed:', error.message)
    response.status(503).json({ status: 'error', database: 'unavailable' })
  }
})
app.get('/api/cron/account-deletions', async (request, response, next) => {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return response.status(503).json({ error: 'CRON_SECRET is not configured in the backend environment.' })
  }
  if (!process.env.DATABASE_URL) {
    return response.status(503).json({ error: 'DATABASE_URL is not configured in the backend environment.' })
  }

  const authorization = request.get('authorization') || ''
  const token = authorization.match(/^Bearer (.+)$/i)?.[1]
  if (!token) return response.status(401).json({ error: 'A valid cron authorization header is required.' })

  const tokenBuffer = Buffer.from(token)
  const secretBuffer = Buffer.from(cronSecret)
  if (tokenBuffer.length !== secretBuffer.length || !timingSafeEqual(tokenBuffer, secretBuffer)) {
    return response.status(401).json({ error: 'A valid cron authorization header is required.' })
  }

  try {
    const processed = await processScheduledAccountDeletions()
    response.json({ status: 'ok', processed })
  } catch (error) {
    next(error)
  }
})
app.use('/api/auth', authRoutes)
app.use('/api/market', marketRoutes)
app.use('/api/watchlist', watchlistRoutes)
app.use('/api/wallet', walletRoutes)
app.use('/api/scan', scanRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/analytics', analyticsRoutes)
app.use('/api/content', contentRoutes)
app.use('/api/assistant', assistantRoutes)
const frontendDistPath = fileURLToPath(new URL('../../frontend/dist/', import.meta.url))
if (process.env.VERCEL !== '1' && process.env.NODE_ENV === 'production' && existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath))
  app.get('*', (request, response, next) => {
    if (request.path.startsWith('/api/')) return next()
    response.sendFile(path.join(frontendDistPath, 'index.html'), (error) => {
      if (error) next(error)
    })
  })
}

app.use((error, _request, response, _next) => {
  console.error(error.message)
  if (!process.env.DATABASE_URL) {
    return response.status(503).json({ error: 'DATABASE_URL is not configured in the backend environment.' })
  }
  if (error.code === '28P01') {
    return response.status(503).json({ error: 'The database rejected the configured credentials. Check DATABASE_URL in the backend environment.' })
  }
  if (error.code === 'ECONNREFUSED') {
    return response.status(503).json({ error: 'The database is not accepting connections. Check DATABASE_URL and the database network settings.' })
  }
  response.status(500).json({ error: 'The request could not be completed.' })
})

export default app

if (process.env.VERCEL !== '1') {
  const port = Number(process.env.PORT) || 3001
  const server = app.listen(port, () => console.log(`MemeScope API listening on http://localhost:${port}`))
  const accountDeletionInterval = setInterval(() => {
    if (!process.env.DATABASE_URL) return
    void processScheduledAccountDeletions().catch((error) => {
      console.error('Scheduled account deletion processing failed:', error.message)
    })
  }, 60_000)
  accountDeletionInterval.unref()
  if (process.env.DATABASE_URL) {
    void processScheduledAccountDeletions().catch((error) => {
      console.error('Initial scheduled account deletion processing failed:', error.message)
    })
  }

  async function shutdown() {
    clearInterval(accountDeletionInterval)
    server.close(async () => {
      await pool.end()
      process.exit(0)
    })
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}
