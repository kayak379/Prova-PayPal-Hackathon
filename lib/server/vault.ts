import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import { database } from './db'
import { env, sign, verify } from './common'
import { paypalRest } from './paypal'

const COOKIE = 'prova-paypal-vault'

type SavedWallet = { id: string; email: string; customerId?: string }
const key = () => createHash('sha256').update(env('PAYPAL_CLIENT_SECRET') + ':vault-cookie').digest()

function seal(wallet: SavedWallet) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(wallet), 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url')
}

async function setDefaultWallet(wallet: SavedWallet | null) {
  await database().query("UPDATE workspace SET wallet=$1 WHERE id='demo'", [wallet ? seal(wallet) : null])
}

export async function savedWallet(): Promise<SavedWallet | null> {
  const value = (await database().query("SELECT wallet FROM workspace WHERE id='demo'")).rows[0]?.wallet
  if (!value) return null
  try {
    const bytes = Buffer.from(value, 'base64url')
    const decipher = createDecipheriv('aes-256-gcm', key(), bytes.subarray(0, 12))
    decipher.setAuthTag(bytes.subarray(12, 28))
    const wallet: SavedWallet = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString())
    return wallet
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
  jar.set(COOKIE, seal(wallet), { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 86400 * 30 })
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
