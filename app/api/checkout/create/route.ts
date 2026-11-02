import { createCheckout } from '@/lib/server/checkout'
import { message } from '@/lib/server/common'
export const runtime = 'nodejs'
export async function POST(request: Request) {
 try { return Response.json(await createCheckout(await request.json(), new URL(request.headers.get('origin') || request.url).origin)) }
 catch (error) { return Response.json({ error: message(error) }, { status: 400 }) }
}
