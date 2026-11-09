'use client'

import { useEffect, useId, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Download, Check, Loader2, Shield, ShieldCheck, ShieldAlert, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { Pressable } from '../kit'
import { EvidenceDialog, EvidenceRecords, RecordedFields } from './evidence-records'
import type { EvidenceView } from '@/lib/evidence'

export function EvidencePanel({ campaignId, version, children }: { campaignId: string; version?: number; children: React.ReactNode }) {
  const [check, setCheck] = useState<EvidenceView | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [refresh, setRefresh] = useState(0)
  const [coverageOpen, setCoverageOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [exported, setExported] = useState(false)
  const reduced = useReducedMotion()
  const detailsId = useId()
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
    setExported(false)
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
      setExported(true)
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Evidence request failed.')
    } finally {
      setExporting(false)
    }
  }

  const result = check?.verification
  const verified = result?.valid && result.signed
  const title = loading ? 'Checking…' : error && !result ? 'Check unavailable' : result && !result.valid ? 'Needs review' : verified ? 'Signed & verified' : result?.valid ? 'Verified · unsigned' : 'Not checked'
  const duration = reduced ? 0 : 0.22
  return (
    <section aria-label="Campaign evidence" className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3 sm:px-6">
        <div role="status" aria-live="polite" className="flex min-w-0 items-center gap-2 text-xs">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={title} initial={{ opacity: 0, y: reduced ? 0 : 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration }} className={'inline-flex items-center gap-2 ' + (verified ? 'text-brand' : result && !result.valid ? 'text-destructive' : 'text-muted-foreground')}>
              {loading ? <Loader2 className="size-3.5 motion-safe:animate-spin" /> : result && !result.valid ? <ShieldAlert className="size-3.5" /> : verified ? <ShieldCheck className="size-3.5" /> : <Shield className="size-3.5" />}{title}
            </motion.span>
          </AnimatePresence>
        </div>
        <motion.button aria-expanded={detailsOpen} aria-controls={detailsId} whileHover={reduced ? undefined : { y: -1 }} whileTap={reduced ? undefined : { scale: 0.97 }} onClick={() => setDetailsOpen(value => !value)} className="inline-flex items-center gap-1.5 rounded-full px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Details <motion.span animate={{ rotate: detailsOpen ? 90 : 0 }} transition={{ duration }}><ChevronRight className="size-3.5" /></motion.span>
        </motion.button>
      </div>
      {(error || (result && !result.valid)) && <p role="alert" className="mx-5 mt-4 rounded-lg bg-destructive/5 p-3 text-sm text-destructive">{error || result?.error}</p>}
      {children}
      <AnimatePresence initial={false}>
        {detailsOpen && <motion.div id={detailsId} key="details" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration }} className="overflow-hidden border-t border-border">
          <div className="px-5 py-4 sm:px-6">
            <p className="text-xs leading-relaxed text-muted-foreground">{result?.valid ? result.count + ' evidence records checked. ' : ''}{verified ? 'The saved campaign data matches its signed history.' : 'Check the recorded history or download a copy.'}</p>
            <div className="mt-3 flex flex-wrap items-center gap-1">
              <Pressable variant="ghost" size="sm" disabled={loading || exporting} aria-label="Verify evidence" onClick={() => setRefresh(value => value + 1)}>{loading ? <Loader2 className="motion-safe:animate-spin" /> : <RefreshCw />} Check again</Pressable>
              {check?.latestRecord && <Pressable variant="ghost" size="sm" onClick={() => setCoverageOpen(true)}>{verified ? 'Signed data' : 'Recorded data'}</Pressable>}
              <Pressable variant="ghost" size="sm" aria-label="Export evidence" disabled={loading || exporting} onClick={exportEvidence}>{exporting ? <Loader2 className="motion-safe:animate-spin" /> : exported ? <Check /> : <Download />}{exported ? 'Downloaded' : 'Download'}</Pressable>
              {check && <Pressable variant="ghost" size="sm" aria-expanded={historyOpen} onClick={() => setHistoryOpen(value => !value)}>Evidence history <motion.span animate={{ rotate: historyOpen ? 90 : 0 }} transition={{ duration }}><ChevronRight /></motion.span></Pressable>}
            </div>
            <AnimatePresence initial={false}>{historyOpen && check && <motion.div key="history" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration }} className="overflow-hidden">
              <EvidenceRecords view={check} />
              {check.pages > 1 && <nav aria-label="Evidence event pages" className="mt-4 flex items-center justify-between gap-2">
                <Pressable variant="ghost" size="sm" disabled={loading || check.page === 1} onClick={() => setPage(check.page - 1)}><ChevronLeft /> Newer</Pressable><span className="text-xs text-muted-foreground">{check.page} / {check.pages}</span><Pressable variant="ghost" size="sm" disabled={loading || check.page === check.pages} onClick={() => setPage(check.page + 1)}>Older <ChevronRight /></Pressable>
              </nav>}
            </motion.div>}</AnimatePresence>
          </div>
        </motion.div>}
      </AnimatePresence>
      {coverageOpen && check?.latestRecord && <EvidenceDialog title={verified ? 'Signature coverage' : 'Recorded campaign data'} onClose={() => setCoverageOpen(false)}>
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
