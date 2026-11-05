import { appOrigin } from '@/lib/server/origin'
import { cookies } from 'next/headers'
import { finishWallet, removeWallet, savedWallet, setupWallet } from '@/lib/server/vault'
import { message } from '@/lib/server/common'
export const runtime = 'nodejs'
export async function GET() {
 const wallet = await savedWallet()
 return Response.json({ saved: !!wallet, email: wallet?.email }, { headers: { 'Cache-Control': 'no-store' } })
}
export async function POST(request: Request) {
 try {
  const origin = appOrigin(request)
  const body = await request.json()
  if (body.action === 'setup') return Response.json(await setupWallet(origin))
  if (body.action === 'confirm') {
   const ticket = (await cookies()).get('prova-paypal-setup')?.value
   if (!ticket || ticket !== body.ticket) throw new Error('PayPal save session does not match this browser.')
   return Response.json(await finishWallet(ticket, origin.startsWith('https:')))
  }
  if (body.action === 'remove') return Response.json(await removeWallet())
  throw new Error('Unknown wallet action.')
 } catch (error) { return Response.json({ error: message(error) }, { status: 400 }) }
}
