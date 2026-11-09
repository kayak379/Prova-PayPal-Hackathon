'use client'

import { useEffect, useState } from 'react'
import { Download, Loader2, Shield, ShieldCheck, ShieldAlert, ChevronLeft, ChevronRight } from 'lucide-react'
import { Pressable } from '../kit'
import { EvidenceRecords, RecordedFields } from './evidence-records'
import type { EvidenceView } from '@/lib/evidence'

export function EvidencePanel({ campaignId, version }: { campaignId: string; version?: number }) {
  const [check, setCheck] = useState<EvidenceView | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [refresh, setRefresh] = useState(0)
  const endpoint = `/api/campaigns/${encodeURIComponent(campaignId)}/evidence`

  useEffect(() => { setPage(1) }, [campaignId, version])

  // Load when the audit tab opens. Aborting prevents an older campaign/page from
  // overwriting the latest view after a save, navigation, or manual verification.
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setCheck(null)
    setError('')
    async function load() {
      try {
        const response = await fetch(`${endpoint}?view=1&page=${page}`, { cache: 'no-store', signal: controller.signal })
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || 'Evidence request failed.')
        if (!controller.signal.aborted) setCheck(body as EvidenceView)
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Evidence request failed.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [endpoint, page, version, refresh])

  async function exportEvidence() {
    setExporting(true)
    setError('')
    try {
      const response = await fetch(endpoint + '?export=1', { cache: 'no-store' })
      if (!response.ok) {
        const body = await response.json()
        throw new Error(body.error || 'Evidence request failed.')
      }
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = url
      link.download = `campaign-${campaignId}-evidence.json`
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Evidence request failed.')
    } finally {
      setExporting(false)
    }
  }

  const result = check?.verification
  return (
    <section aria-label="Campaign evidence" className="mb-5 rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl">
          <h3 className="flex items-center gap-2 font-medium">
            {result && !result.valid ? <ShieldAlert className="size-4 text-destructive" /> : result?.valid ? <ShieldCheck className="size-4 text-muted-foreground" /> : <Shield className="size-4 text-muted-foreground" />}
            Evidence chain
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Check recorded campaign changes and financial results for tampering. Save an evidence export separately to retain a checkpoint.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Pressable variant="secondary" disabled={loading || exporting} onClick={() => setRefresh(value => value + 1)}>
            {loading ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Verify evidence
          </Pressable>
          <Pressable variant="secondary" disabled={loading || exporting} onClick={exportEvidence}>
            {exporting ? <Loader2 className="animate-spin" /> : <Download />} Export evidence
          </Pressable>
        </div>
      </div>
      <div role="status" aria-live="polite" className="mt-3 text-sm">
        {error ? <p className="text-destructive">{error}</p> : result ? (
          <>
            <p className={result.valid ? 'text-foreground' : 'text-destructive'}>
              {result.valid ? `Verified ${result.count} evidence ${result.count === 1 ? 'event' : 'events'} · ${result.signed ? 'Signed checkpoint' : 'Unsigned chain'}` : `Verification failed: ${result.error}`}
            </p>
            {result.valid && (
              <>
                <p className="mt-1 text-xs text-muted-foreground">
                  {result.signed ? 'The recorded signature is valid. Independently retain the trusted public key to authenticate exported evidence.' : 'The latest record has no signature. Verification checks hashes and saved campaign state.'}
                  {result.baseline && ' Earlier history is included as a baseline recorded when evidence tracking began.'}
                </p>
                <details className="mt-2 text-xs text-muted-foreground">
                  <summary className="cursor-pointer">Checkpoint details</summary>
                  <p className="mt-2 break-all font-mono">Head: {result.headHash}</p>
                  {result.keyId && <p className="mt-1 break-all font-mono">Key fingerprint: {result.keyId}</p>}
                  <p className="mt-1">Checked {new Date(check.checkedAt).toLocaleString()} · campaign revision {check.campaignVersion}</p>
                </details>
              </>
            )}
          </>
        ) : <p className="text-xs text-muted-foreground">{loading ? 'Loading and verifying campaign evidence…' : 'Evidence has not been loaded.'}</p>}
      </div>
      {check && (
        <>
          {check.latestRecord && (
            <div className="mt-5 rounded-xl border border-border p-4">
              <h4 className="text-sm font-medium">
                {result?.valid && result.signed ? `Campaign data covered by signed checkpoint #${check.latestRecord.event.sequence}` : 'Campaign data in the latest evidence record'}
              </h4>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                These are the fields actually recorded in event #{check.latestRecord.event.sequence}. Expand a field to see its exact value and nested data.
                {' '}Action tokens, signed price snapshots, proof strings, and attachment contents appear as SHA-256 commitments instead of their original contents.
              </p>
              {!result?.valid && <p className="mt-2 text-xs text-destructive">Verification failed. This snapshot cannot be treated as verified campaign data.</p>}
              <RecordedFields record={check.latestRecord} />
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                Coverage is for this saved snapshot. Fields absent above were not present in it. The internal version counter and organization settings outside the campaign are excluded. Signing detects changes; it does not encrypt data or prove physical delivery.
              </p>
            </div>
          )}
          <EvidenceRecords view={check} />
          {check.pages > 1 && (
            <nav aria-label="Evidence event pages" className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <Pressable variant="secondary" size="sm" disabled={loading || check.page === 1} onClick={() => setPage(check.page - 1)}><ChevronLeft /> Newer events</Pressable>
              <span className="text-xs text-muted-foreground">Page {check.page} of {check.pages}</span>
              <Pressable variant="secondary" size="sm" disabled={loading || check.page === check.pages} onClick={() => setPage(check.page + 1)}>Older events <ChevronRight /></Pressable>
            </nav>
          )}
        </>
      )}
    </section>
  )
}
