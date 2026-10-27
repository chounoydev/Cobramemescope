import pg from 'pg'

const { Pool } = pg

function usesManagedDatabaseTls(connectionString) {
  if (!connectionString) return false
  try {
    const hostname = new URL(connectionString).hostname
    return hostname.endsWith('.supabase.co')
      || hostname.endsWith('.pooler.supabase.com')
      || hostname.endsWith('.neon.tech')
  } catch {
    return false
  }
}

const databaseUrl = process.env.DATABASE_URL?.trim() || null
const migrationDatabaseUrl = process.env.DATABASE_URL_UNPOOLED?.trim() || databaseUrl
const useTls = process.env.DATABASE_SSL === 'true' || usesManagedDatabaseTls(databaseUrl)

function createUnavailablePool() {
  return {
    async query() {
      throw new Error('DATABASE_URL is not configured in the backend environment.')
    },
    async connect() {
      throw new Error('DATABASE_URL is not configured in the backend environment.')
    },
    async end() {},
  }
}

function createPool(connectionString) {
  return new Pool({
      connectionString,
      ssl: useTls ? { rejectUnauthorized: true } : undefined,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    })
}

export const pool = databaseUrl ? createPool(databaseUrl) : createUnavailablePool()
export const migrationPool = migrationDatabaseUrl
  ? createPool(migrationDatabaseUrl)
  : createUnavailablePool()

export function query(text, values) {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not configured in the backend environment.')
  }
  return pool.query(text, values)
}
