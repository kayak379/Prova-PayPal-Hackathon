import { env } from '@/lib/server/common'
export async function GET() {
 return Response.json({ clientId: env('PAYPAL_CLIENT_ID') })
}
