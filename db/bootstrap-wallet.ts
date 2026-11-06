import type { PoolClient } from 'pg'
import { openWallet } from '../lib/server/wallet-crypto'
// Import a previously consented sandbox wallet once. Never reattach a disconnected wallet on redeploy.
export async function bootstrapWallet(client: Pick<PoolClient, 'query'>, encrypted?: string, secret?: string) {
  if (!encrypted) return
  const row = (await client.query("SELECT wallet, wallet_bootstrapped FROM workspace WHERE id='demo' FOR UPDATE")).rows[0]
  if (!row || row.wallet_bootstrapped) return
  if (!row.wallet) {
    if (!secret) throw new Error('PAYPAL_CLIENT_SECRET is required to import the saved sandbox wallet.')
    let wallet
    try { wallet = openWallet(encrypted, secret) } catch { throw new Error('The saved sandbox wallet cannot be decrypted with PAYPAL_CLIENT_SECRET.') }
    await client.query("UPDATE workspace SET wallet=$1, settings=jsonb_set(settings,'{paypalEmail}',to_jsonb($2::text)) WHERE id='demo'", [encrypted, wallet.email])
  }
  await client.query("UPDATE workspace SET wallet_bootstrapped=true WHERE id='demo'")
}
