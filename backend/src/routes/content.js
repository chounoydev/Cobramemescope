import { Router } from 'express'
import { getLandingEventImage, listLandingEvents } from '../services/landingContent.js'
import { getSeasonalTheme } from '../services/siteTheme.js'

const router = Router()

router.get('/events', async (_request, response, next) => {
  try {
    response.set('Cache-Control', 'public, max-age=30')
    response.json({ events: await listLandingEvents() })
  } catch (error) {
    next(error)
  }
})

router.get('/event-images/:id', async (request, response, next) => {
  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(request.params.id)) {
    return response.status(400).json({ error: 'Invalid event image id.' })
  }
  try {
    const image = await getLandingEventImage(request.params.id)
    if (!image) return response.status(404).json({ error: 'Event image not found.' })
    response.set({
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Type': image.content_type,
      'X-Content-Type-Options': 'nosniff',
    })
    response.send(image.image_data)
  } catch (error) {
    next(error)
  }
})

router.get('/theme', async (_request, response, next) => {
  try {
    response.set('Cache-Control', 'no-store')
    response.json(await getSeasonalTheme())
  } catch (error) {
    next(error)
  }
})

export default router