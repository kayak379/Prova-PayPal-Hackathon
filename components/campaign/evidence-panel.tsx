'use client'

import { useEffect, useRef, useState } from 'react'
import { Download, Loader2, ShieldCheck, ShieldAlert } from 'lucide-react'
import { Pressable } from '../kit'
import type { EvidenceVerification } from '@/lib/evidence'

type Check = { verification: EvidenceVerification; campaignVersion: number; checkedAt: string }

export function EvidencePanel({ campaignId, version }: { campaignId: string; version?: number }) {
  const [check, setCheck] = useState<Check | null>(null)
  const [busy, setBusy] = useState<'verify' | 'export' | null>(null)
  const [error, setError] = useState('')
  const revision = useRef(0)
  const endpoint = `/api/campaigns/${encodeURIComponent(campaignId)}/evidence`

  // Clear results when a later workspace revision arrives. Requests are explicitly
  // initiated by the operator, so opening a long history has no background cost.
  useEffect(() => {
    revision.current++
    setCheck(null)
    setError('')
    return () => { revision.current++ }
  }, [campaignId, version])

  async function run(action: 'verify' | 'export') {
    const requestRevision = revision.current
    setBusy(action)
    setError('')
    try {
      const response = await fetch(endpoint + (action === 'export' ? '?export=1' : ''), { cache: 'no-store' })
      if (!response.ok) {
        const body = await response.json()
        throw new Error(body.error || 'Evidence request failed.')
      }
      if (action === 'verify') {
        const result = await response.json() as Check
        if (requestRevision === revision.current) setCheck(result)
      } else {
        const url = URL.createObjectURL(await response.blob())
        const link = document.createElement('a')
        link.href = url
        link.download = `campaign-${campaignId}-evidence.json`
        document.body.appendChild(link)
        link.click()
        link.remove()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
    } catch (cause) {
      if (requestRevision === revision.current) setError(cause instanceof Error ? cause.message : 'Evidence request failed.')
    } finally {
      setBusy(null)
    }
  }

  const result = check?.verification
  return (
    <section aria-label="Campaign evidence" className="mb-5 rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl">
          <h3 className="flex items-center gap-2 font-medium">
            {result && !result.valid ? <ShieldAlert className="size-4 text-destructive" /> : <ShieldCheck className="size-4 text-muted-foreground" />}
            Evidence chain
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Check recorded campaign changes and financial results for tampering. Save an evidence export separately to retain a checkpoint.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Pressable variant="secondary" disabled={busy !== null} onClick={() => run('verify')}>
            {busy === 'verify' ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Verify evidence
          </Pressable>
          <Pressable variant="secondary" disabled={busy !== null} onClick={() => run('export')}>
            {busy === 'export' ? <Loader2 className="animate-spin" /> : <Download />} Export evidence
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
                  {result.signed ? 'The recorded signature is valid. Independently retain the trusted public key to authenticate exported evidence.' : 'No signing key was configured for the latest record. Verification checks hashes and saved campaign state.'}
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
        ) : <p className="text-xs text-muted-foreground">Verification has not been run for the current campaign view.</p>}
      </div>
    </section>
  )
}
