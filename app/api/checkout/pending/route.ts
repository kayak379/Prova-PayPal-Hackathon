import { database } from '@/lib/server/db'
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('campaign')
  const result = await database().query('SELECT data FROM payment_attempts WHERE campaign_id=$1 AND completed=false', [id])
  return Response.json(result.rows[0]?.data || null, { headers: { 'Cache-Control': 'no-store' } })
}
