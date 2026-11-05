import { appOrigin } from '@/lib/server/origin'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { finishWallet } from '@/lib/server/vault'
export async function GET(request: Request) {
 const url = new URL(request.url)
 const origin = appOrigin(request)
 const ticket = (await cookies()).get('prova-paypal-setup')?.value
 let status = 'cancelled'
 try { if (ticket && !url.searchParams.has('cancelled')) { await finishWallet(ticket, origin.startsWith('https:')); status = 'saved' } }
 catch { status = 'failed' }
 return NextResponse.redirect(`${origin}/dashboard?paypal=${status}`)
}
