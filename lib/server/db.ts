import { Pool, type PoolClient } from 'pg'

const shared = globalThis as unknown as { provaPool?: Pool }
export function database() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured.')
  if (shared.provaPool) return shared.provaPool
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
  })
  pool.on('error', error => console.error('Idle PostgreSQL connection failed', error.message))
  shared.provaPool = pool
  return pool
}

export async function transaction<T>(work: (client: PoolClient) => Promise<T>) {
  const client = await database().connect()
  try {
    await client.query('BEGIN')
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally { client.release() }
}
