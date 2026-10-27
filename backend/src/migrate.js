import './env.js'
import { readFile } from 'node:fs/promises'
import { migrationPool } from './db.js'

try {
  const schema = await readFile(new URL('../schema.sql', import.meta.url), 'utf8')
  await migrationPool.query(schema)
  console.log('Database schema is ready.')
} catch (error) {
  console.error('Database schema initialization failed:', error.message)
  process.exitCode = 1
} finally {
  await migrationPool.end()
}
