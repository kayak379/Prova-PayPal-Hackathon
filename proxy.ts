import { NextResponse, type NextRequest } from 'next/server'
import { appOrigin } from './lib/server/origin'
import { SESSION_COOKIE, validSession } from './lib/server/session'

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname
  // Require same-origin browser mutations, including sign-in and sign-out.
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    if (request.headers.get('origin') !== appOrigin(request))
      return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 })
  }
  if (path.startsWith('/api/auth/')) return NextResponse.next()
  if (!validSession(request.cookies.get(SESSION_COOKIE)?.value)) {
    if (path.startsWith('/api/')) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })
    return NextResponse.redirect(new URL('/login', appOrigin(request)))
  }
  return NextResponse.next()
}
export const config = { matcher: ['/dashboard/:path*', '/campaigns/:path*', '/paypal/:path*', '/api/:path*'] }
