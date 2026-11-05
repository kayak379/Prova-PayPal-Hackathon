import { createHmac, timingSafeEqual, createHash } from 'node:crypto'

export const SESSION_COOKIE = 'prova-session'
export function secret() {
  const value = process.env.SESSION_SECRET
  if (!value || value.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters.')
  return value
}
export function equal(a: string, b: string) {
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest())
}
export function newSession() {
  const payload = Buffer.from(JSON.stringify({ expires: Date.now() + 86400000 })).toString('base64url')
  return `${payload}.${createHmac('sha256', secret()).update(payload).digest('base64url')}`
}
export function validSession(token?: string) {
  try {
    const [payload, signature] = (token || '').split('.')
    if (!equal(signature || '', createHmac('sha256', secret()).update(payload).digest('base64url'))) return false
    return JSON.parse(Buffer.from(payload, 'base64url').toString()).expires > Date.now()
  } catch { return false }
}
