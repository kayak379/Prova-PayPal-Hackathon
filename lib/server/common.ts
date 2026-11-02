import { createHmac, timingSafeEqual } from 'node:crypto'
export function env(name: string) { const value = process.env[name]; if (!value) throw new Error(`Missing ${name} in .env.local`); return value }
export function sign(value: unknown) {
 const data = Buffer.from(JSON.stringify(value)).toString('base64url')
 return data + '.' + createHmac('sha256', env('PAYPAL_CLIENT_SECRET')).update(data).digest('base64url')
}
export function verify<T>(token: string): T {
 const [data, signature] = String(token).split('.')
 const expected = createHmac('sha256', env('PAYPAL_CLIENT_SECRET')).update(data || '').digest()
 const received = Buffer.from(signature || '', 'base64url')
 if (expected.length !== received.length || !timingSafeEqual(expected, received)) throw new Error('Invalid checkout data. Rebuild the proposal.')
 return JSON.parse(Buffer.from(data, 'base64url').toString())
}
export async function external(url: string, init: RequestInit = {}) {
 const response = await fetch(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(120000) })
 const data = await response.json()
 if (response.status === 429 && new URL(url).hostname === 'openrouter.ai') throw new Error('OpenRouter’s free-model request limit has been reached. Wait for the allowance to reset or add credits in OpenRouter, then retry; your campaign is saved.')
 if (!response.ok) throw new Error(`API ${new URL(url).hostname} returned ${response.status}. ${data?.error?.message || 'Please retry.'}`)
 return data
}
export const message = (error: unknown) => error instanceof Error ? error.message : 'Request failed. Please retry.'
