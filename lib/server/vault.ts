import { sealWallet, openWallet, type SavedWallet } from './wallet-crypto'
import { cookies } from 'next/headers'
import { database } from './db'
import { env, sign, verify } from './common'
import { paypalRest } from './paypal'

const COOKIE = 'prova-paypal-vault'

async function setDefaultWallet(wallet: SavedWallet | null) {
  await database().query("UPDATE workspace SET wallet=$1 WHERE id='demo'", [wallet ? sealWallet(wallet, env('PAYPAL_CLIENT_SECRET')) : null])
}

export async function savedWallet(): Promise<SavedWallet | null> {
  const value = (await database().query("SELECT wallet FROM workspace WHERE id='demo'")).rows[0]?.wallet
  if (!value) return null
  try {
    return openWallet(value, env('PAYPAL_CLIENT_SECRET'))
  } catch {
    return null
  }
}

export async function setupWallet(origin: string) {
  const setup = await paypalRest('/v3/vault/setup-tokens', 'POST', {
    payment_source: {
      paypal: {
        description: 'Save PayPal for approved Prova sandbox supply purchases',
        usage_type: 'MERCHANT',
        customer_type: 'CONSUMER',
        permit_multiple_payment_tokens: true,
        experience_context: {
          brand_name: 'Prova',
          shipping_preference: 'NO_SHIPPING',
          return_url: `${origin}/paypal/save`,
          cancel_url: `${origin}/paypal/save?cancelled=1`
        }
      }
    }
  })
  if (!setup.id) throw new Error('PayPal did not return a setup token.')
  const ticket = sign({ kind: 'vault-setup', id: setup.id, expires: Date.now() + 3600000 })
  const jar = await cookies()
  jar.set('prova-paypal-setup', ticket, {
    httpOnly: true,
    sameSite: 'lax',
    secure: origin.startsWith('https:'),
    path: '/',
    maxAge: 3600,
  })
  return { vaultSetupToken: setup.id, ticket }
}

export async function finishWallet(ticket: string, secure: boolean) {
  const setup = verify<{ kind: string; id: string; expires: number }>(ticket)
  if (setup.kind !== 'vault-setup' || setup.expires < Date.now()) throw new Error('PayPal save session expired. Please start again.')
  const status = await paypalRest(`/v3/vault/setup-tokens/${encodeURIComponent(setup.id)}`)
  if (status.status !== 'APPROVED') throw new Error('Approve saving your wallet in PayPal first.')
  const token = await paypalRest('/v3/vault/payment-tokens', 'POST', { payment_source: { token: { id: setup.id, type: 'SETUP_TOKEN' } } }, `save-${setup.id}`)
  if (!token.id || !token.payment_source?.paypal) throw new Error('PayPal did not confirm a saved wallet.')
  const wallet: SavedWallet = {
    id: token.id,
    email: token.payment_source.paypal.email_address || 'Saved PayPal wallet',
    customerId: token.customer?.id
  }
  await setDefaultWallet(wallet)
  const jar = await cookies()
  jar.set(COOKIE, sealWallet(wallet, env('PAYPAL_CLIENT_SECRET')), { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 86400 * 30 })
  jar.delete('prova-paypal-setup')
  return { saved: true, email: wallet.email }
}

export async function removeWallet() {
  const wallet = await savedWallet()
  if (wallet) await paypalRest(`/v3/vault/payment-tokens/${encodeURIComponent(wallet.id)}`, 'DELETE')
  await setDefaultWallet(null)
  const jar = await cookies()
  jar.delete(COOKIE)
  return { saved: false }
}
