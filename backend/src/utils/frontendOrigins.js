const configuredFrontendOrigins = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

export function isAllowedFrontendOrigin(origin) {
  if (configuredFrontendOrigins.includes(origin)) return true
  if (process.env.RENDER_EXTERNAL_URL && origin === process.env.RENDER_EXTERNAL_URL) return true
  if (process.env.NODE_ENV === 'production') return false

  try {
    const { hostname, protocol } = new URL(origin)
    return ['http:', 'https:'].includes(protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(hostname)
  } catch {
    return false
  }
}
