import './env'
import { readdir, readFile } from 'node:fs/promises'
import { database, transaction } from '../lib/server/db'
import { seed } from '../db/seed'
import { bootstrapWallet } from '../db/bootstrap-wallet'
import { bootstrapRetailers } from '../db/bootstrap-retailers'
import { sandboxRetailers } from '../db/sandbox-retailers'
import { baselineEvidence } from '../lib/server/evidence'
async function main() {
  await transaction(async client => {
    await client.query("SELECT pg_advisory_xact_lock(70261105)")
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())')
    for (const name of (await readdir('db/migrations')).filter(n => n.endsWith('.sql')).sort()) {
      const exists = await client.query('SELECT name FROM schema_migrations WHERE name=$1', [name])
      if (exists.rows.length) continue
      await client.query(await readFile('db/migrations/' + name, 'utf8'))
      await client.query('INSERT INTO schema_migrations(name) VALUES($1)', [name])
      console.log('Applied migration:', name)
    }
    await baselineEvidence(client)
    await seed(client)
    await bootstrapRetailers(client, sandboxRetailers)
    await bootstrapWallet(client, process.env.PAYPAL_DEFAULT_VAULT_WALLET, process.env.PAYPAL_CLIENT_SECRET)
  })
  console.log('Database ready; existing workspace data preserved.')
}
main().catch(e => { console.error(e); process.exitCode = 1 }).finally(async () => { if (process.env.DATABASE_URL) await database().end() })
