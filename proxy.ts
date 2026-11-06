import { NextResponse, type NextRequest } from 'next/server'
import { appOrigin } from './lib/server/origin'
import { SESSION_COOKIE, validSession } from './lib/server/session'
import { rateLimit } from './lib/server/rate-limit'

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname
  // PayPal has no browser session or Origin header. This exact endpoint verifies
  // every delivery with PayPal before it can write financial data.
  if (path === '/api/paypal/webhook' && request.method === 'POST') return NextResponse.next()
  // Require same-origin browser mutations, including sign-in and sign-out.
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    if (request.headers.get('origin') !== appOrigin(request))
      return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 })
  }
  if (!path.startsWith('/api/auth/') && !validSession(request.cookies.get(SESSION_COOKIE)?.value)) {
    if (path.startsWith('/api/')) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })
    return NextResponse.redirect(new URL('/login', appOrigin(request)))
  }
  if (path.startsWith('/api/')) {
    const retryAfter = rateLimit(path)
    if (retryAfter) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait before trying again.' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } },
      )
    }
  }
  return NextResponse.next()
}
export const config = { matcher: ['/dashboard/:path*', '/campaigns/:path*', '/paypal/:path*', '/api/:path*'] }
