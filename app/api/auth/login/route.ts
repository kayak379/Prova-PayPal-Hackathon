import { NextResponse } from 'next/server'
import { database } from '@/lib/server/db'
import { equal, newSession, SESSION_COOKIE } from '@/lib/server/session'

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json()
    if (!process.env.DEMO_EMAIL || !process.env.DEMO_PASSWORD) throw new Error('Demo login is not configured.')
    if (typeof email !== 'string' || typeof password !== 'string' ||
      !equal(email.toLowerCase(), process.env.DEMO_EMAIL.toLowerCase()) || !equal(password, process.env.DEMO_PASSWORD))
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 })
    const ready = await database().query('SELECT id FROM workspace WHERE id = $1', ['demo'])
    if (!ready.rows.length) throw new Error('Run database setup before signing in.')
    const response = NextResponse.json({ ok: true })
    response.cookies.set(SESSION_COOKIE, newSession(), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 86400 })
    return response
  } catch (error) {
    console.error('Sign-in failed', error)
    return NextResponse.json({ error: 'Sign-in is unavailable. Check server configuration and database setup.' }, { status: 503 })
  }
}
