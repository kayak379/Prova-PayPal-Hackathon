'use client'

import { useEffect, useState } from 'react'
import { Download, Loader2, Shield, ShieldCheck, ShieldAlert, ChevronLeft, ChevronRight, ArrowUpRight, RefreshCw } from 'lucide-react'
import { Pressable } from '../kit'
import { EvidenceDialog, EvidenceRecords, RecordedFields } from './evidence-records'
import type { EvidenceView } from '@/lib/evidence'

export function EvidencePanel({ campaignId, version }: { campaignId: string; version?: number }) {
  const [check, setCheck] = useState<EvidenceView | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [refresh, setRefresh] = useState(0)
  const [coverageOpen, setCoverageOpen] = useState(false)
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
  const verified = result?.valid && result.signed
  const title = loading ? 'Checking campaign integrity' : error ? 'Evidence unavailable' : result && !result.valid ? 'Integrity check needs attention' : verified ? 'Campaign integrity verified' : 'Campaign history verified'
  return (
    <section aria-label="Campaign evidence" className="mb-7">
      <div className="rounded-2xl border border-border bg-card px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3.5">
            <span className={'flex size-11 shrink-0 items-center justify-center rounded-full ' + (verified ? 'bg-brand-soft text-brand' : 'bg-muted text-muted-foreground')}>
              {loading ? <Loader2 className="size-5 animate-spin" /> : result && !result.valid ? <ShieldAlert className="size-5 text-destructive" /> : verified ? <ShieldCheck className="size-5" /> : <Shield className="size-5" />}
            </span>
            <div role="status" aria-live="polite">
              <h3 className="text-sm font-medium">{title}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{loading ? 'Checking the saved records and signatures…' : result ? result.count + ' events · ' + (!result.valid ? 'Verification failed' : result.signed ? 'Signed checkpoint' : 'Unsigned chain') : 'Try verifying again.'}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 pl-[58px] sm:ml-auto sm:pl-0">
            <Pressable variant="ghost" size="sm" aria-label="Verify evidence" disabled={loading || exporting} onClick={() => setRefresh(value => value + 1)}><RefreshCw /> Verify</Pressable>
            <Pressable variant="ghost" size="sm" aria-label="Export evidence" disabled={loading || exporting} onClick={exportEvidence}>{exporting ? <Loader2 className="animate-spin" /> : <Download />} Export</Pressable>
          </div>
        </div>
        {(error || (result && !result.valid)) && <p role="alert" className="mt-3 text-sm text-destructive">{error || result?.error}</p>}
        {check?.latestRecord && <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3.5">
          <p className="text-xs text-muted-foreground">{verified ? 'The recorded campaign data is covered by this signature.' : 'Review the data recorded in the latest event.'}</p>
          <button onClick={() => setCoverageOpen(true)} className="inline-flex items-center gap-1.5 rounded-md text-xs font-medium text-brand outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">View coverage <ArrowUpRight className="size-3.5" /></button>
        </div>}
      </div>
      {check && <>
        <EvidenceRecords view={check} />
        {check.pages > 1 && <nav aria-label="Evidence event pages" className="mt-4 flex items-center justify-between gap-2">
          <Pressable variant="ghost" size="sm" disabled={loading || check.page === 1} onClick={() => setPage(check.page - 1)}><ChevronLeft /> Newer</Pressable>
          <span className="text-xs text-muted-foreground">{check.page} / {check.pages}</span>
          <Pressable variant="ghost" size="sm" disabled={loading || check.page === check.pages} onClick={() => setPage(check.page + 1)}>Older <ChevronRight /></Pressable>
        </nav>}
      </>}
      {coverageOpen && check?.latestRecord && <EvidenceDialog title="Signature coverage" onClose={() => setCoverageOpen(false)}>
        <p className="text-sm leading-relaxed text-muted-foreground">{verified ? 'These saved campaign fields are covered by the latest signed checkpoint.' : 'These fields are present in the latest recorded snapshot.'} Select a field to inspect its recorded value.</p>
        {!result?.valid && <p className="mt-3 text-sm text-destructive">Verification failed. This snapshot is not verified.</p>}
        <RecordedFields record={check.latestRecord} />
        <details className="mt-4 border-t border-border pt-4 text-xs text-muted-foreground">
          <summary className="cursor-pointer">About this protection</summary>
          <p className="mt-3 leading-relaxed">This covers event #{check.latestRecord.event.sequence}. Absent fields, the internal version counter, and organization settings outside the campaign are excluded. Tokens and attachment contents appear as hashes. Signing detects changes; it does not encrypt data or prove delivery.</p>
          {result?.baseline && <p className="mt-3 leading-relaxed">Earlier history was imported as a baseline. A later signature protects that baseline from changes, without witnessing the original activity.</p>}
          <p className="mt-3 leading-relaxed">Retain an export and trusted public key independently to verify its origin and detect history replacement.</p>
          <dl className="mt-3 space-y-3">{Object.entries({ 'Head hash': result?.headHash ?? 'Unavailable', 'Key fingerprint': result?.keyId ?? 'Unsigned', Checked: new Date(check.checkedAt).toLocaleString() }).map(([label, value]) => <div key={label}><dt>{label}</dt><dd className="mt-1 break-all font-mono">{value}</dd></div>)}</dl>
        </details>
      </EvidenceDialog>}
    </section>
  )
}
