import './env'
import { database, transaction } from '../lib/server/db'
import { seed } from '../db/seed'
import { bootstrapWallet } from '../db/bootstrap-wallet'
import { bootstrapRetailers } from '../db/bootstrap-retailers'
import { sandboxRetailers } from '../db/sandbox-retailers'
async function main() {
  if (!process.argv.includes('--confirm-reset')) throw new Error('This deletes ALL shared workspace campaigns, payment recovery records, and wallet references. Run with --confirm-reset only for an intentional demo reset.')
  await transaction(async client => {
    await client.query('DELETE FROM paypal_webhook_events')
    await client.query('DELETE FROM payment_attempts')
    await client.query('DELETE FROM campaigns')
    await client.query('DELETE FROM workspace')
    await seed(client)
    await bootstrapRetailers(client, sandboxRetailers)
    await bootstrapWallet(client, process.env.PAYPAL_DEFAULT_VAULT_WALLET, process.env.PAYPAL_CLIENT_SECRET)
  })
  console.log('Demo workspace reset. Existing PayPal transactions were not changed.')
}
main().catch(e => { console.error(e); process.exitCode = 1 }).finally(async () => { if (process.env.DATABASE_URL) await database().end() })
