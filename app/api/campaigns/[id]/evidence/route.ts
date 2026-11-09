import { campaignEvidence } from '@/lib/server/evidence'

export const runtime = 'nodejs'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { bundle, verification, campaignVersion } = await campaignEvidence(id)
    const headers: Record<string, string> = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }
    if (new URL(request.url).searchParams.get('export') === '1') {
      headers['Content-Disposition'] = `attachment; filename="campaign-${id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100)}-evidence.json"`
      // Export invalid evidence too, so it can be investigated independently.
      return Response.json({ ...bundle, verification }, { headers })
    }
    return Response.json({ verification, campaignVersion, checkedAt: bundle.exportedAt, head: bundle.head }, { headers })
  } catch (error) {
    const missing = error instanceof Error && error.message === 'Campaign not found.'
    if (!missing) console.error('Evidence read failed', error)
    return Response.json({ error: missing ? 'Campaign not found.' : 'Evidence unavailable. Check database setup and try again.' }, {
      status: missing ? 404 : 503, headers: { 'Cache-Control': 'no-store' },
    })
  }
}
