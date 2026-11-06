import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
export type SavedWallet = { id: string; email: string; customerId?: string }
const key = (secret: string) => createHash('sha256').update(secret + ':vault-cookie').digest()
export function sealWallet(wallet: SavedWallet, secret: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(secret), iv)
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(wallet), 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url')
}
export function openWallet(value: string, secret: string): SavedWallet {
  const bytes = Buffer.from(value, 'base64url')
  const decipher = createDecipheriv('aes-256-gcm', key(secret), bytes.subarray(0, 12))
  decipher.setAuthTag(bytes.subarray(12, 28))
  const wallet = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString())
  if (!wallet || typeof wallet.id !== 'string' || !wallet.id || typeof wallet.email !== 'string' || !wallet.email) throw new Error('Invalid saved wallet.')
  return wallet
}
