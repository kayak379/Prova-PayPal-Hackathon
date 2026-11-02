import { captureCheckout } from '@/lib/server/checkout'
import { message } from '@/lib/server/common'
export const runtime = 'nodejs'
export async function POST(request: Request) {
 try { return Response.json(await captureCheckout(await request.json())) }
 catch (error) { return Response.json({ error: message(error) }, { status: 400 }) }
}
