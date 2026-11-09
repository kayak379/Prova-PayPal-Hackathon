'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronRight, Copy, FileText, ShieldCheck, User, Sparkles } from 'lucide-react'
import type { EvidenceRecord, EvidenceView } from '@/lib/evidence'
import { Modal } from '../modal'
import { cn } from '@/lib/utils'

export const FIELDS: Record<string, string> = {
  id: 'Campaign ID', name: 'Campaign name', budget: 'Budget', folderId: 'Folder', address: 'Shipping address',
  taxId: 'Tax ID', createdAt: 'Created time', deletedAt: 'Deletion time', demo: 'Demo status',
  disaster: 'Disaster report & response assumptions', request: 'Supply request', requestAttachment: 'Request attachment',
  proposal: 'Proposal, products, quantities & prices', orders: 'Purchases, receipts & payouts', funding: 'Sponsor funding',
  refunds: 'Refunds & supplier allocations', financeMessages: 'Finance conversations', financeOperations: 'Finance actions',
  verification: 'Financial verification results', audit: 'Activity history',
}
const EVENTS: Record<string, string> = {
  'history.baseline': 'Existing history recorded as a baseline', 'campaign.created': 'Campaign created',
  'campaign.updated': 'Campaign updated', 'signing.activated': 'Signing enabled',
  'workspace.campaign': 'Campaign settings saved', 'workspace.proposal': 'Supply proposal saved',
  'workspace.finance': 'Finance review saved', 'workspace.audit': 'Activity note added', 'workspace.delete': 'Campaign archived',
  'checkout.approved': 'Checkout requested', 'checkout.created': 'PayPal checkout created',
  'checkout.capture.verified': 'Payment capture verified', 'finance.approval.requested': 'Financial action requested',
  'finance.prepare': 'Financial action prepared', 'finance.confirm': 'Financial action processed',
  'finance.invoice': 'Sponsor invoice checked', 'finance.refund': 'Refund checked', 'finance.reconcile': 'Financial records reconciled',
  'finance.assistant.result': 'Finance assistant result saved', 'paypal.webhook.verified': 'PayPal webhook verified',
  'paypal.payouts.checked': 'Retailer payouts checked', 'paypal.reconciled': 'PayPal records reconciled',
}
const SOURCES: Record<string, string> = {
  'shared-account': 'Shared team account', server: 'Prova server', 'disaster-worker': 'Disaster worker',
  'paypal-webhook': 'Verified PayPal webhook handler', migration: 'Database migration', demo: 'Demo data',
}

function JsonValue({ value }: { value: unknown }) {
  return <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-muted/60 p-3 font-mono text-xs leading-relaxed">{JSON.stringify(value, null, 2)}</pre>
}

export function RecordedFields({ record }: { record: EvidenceRecord }) {
  const state = record.event.state
  if (!state || typeof state !== 'object' || Array.isArray(state)) return <JsonValue value={state} />
  return (
    <div className="mt-3 divide-y divide-border">
      {Object.entries(state).sort(([a], [b]) => a.localeCompare(b)).map(([field, value]) => (
        <details key={field} className="py-3">
          <summary className="cursor-pointer text-sm">
            {FIELDS[field] ?? field}
            <span className="ml-2 text-xs text-muted-foreground">
              {Array.isArray(value) ? `${value.length} ${value.length === 1 ? 'record' : 'records'}` : value === null ? 'Empty' : typeof value === 'object' ? 'Recorded fields' : 'Recorded value'}
            </span>
          </summary>
          <JsonValue value={value} />
        </details>
      ))}
    </div>
  )
}

export function EvidenceDialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const content = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const frame = requestAnimationFrame(() => content.current?.focus())
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const nodes = [...(content.current?.closest('[role="dialog"]')?.querySelectorAll<HTMLElement>('button:not(:disabled), summary, [tabindex="0"]') ?? [])].filter(node => node.getClientRects().length)
      const first = nodes[0], last = nodes.at(-1)
      if (event.shiftKey && (document.activeElement === first || document.activeElement === content.current)) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', trap)
    return () => { cancelAnimationFrame(frame); document.removeEventListener('keydown', trap); document.body.style.overflow = overflow; previous?.focus() }
  }, [])
  return <Modal open onClose={onClose} title={title} className="max-w-xl"><div ref={content} tabIndex={-1} className="outline-none">{children}</div></Modal>
}

function ProofValue({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return <div className="border-b border-border py-3 last:border-0"><div className="flex items-center justify-between gap-3"><dt className="text-xs text-muted-foreground">{label}</dt><button aria-label={`Copy ${label.toLowerCase()}`} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring" onClick={async () => { try { await navigator.clipboard.writeText(value); setCopied(true) } catch { setCopied(false) } }}>{copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}</button></div><dd className="mt-1 break-all font-mono text-xs leading-relaxed">{value}</dd></div>
}

function EventDetail({ record, valid }: { record: EvidenceView['records'][number]; valid: boolean }) {
  const [tab, setTab] = useState('Overview')
  const { event, checkpoint } = record
  const status = !valid ? 'Verification failed' : checkpoint ? 'Signed checkpoint' : record.coveredBySequence ? `Covered by checkpoint #${record.coveredBySequence}` : 'Unsigned record'
  return <>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>Event #{event.sequence} · {new Date(event.recordedAt).toLocaleString()}</span><span className={cn('rounded-full bg-muted px-2.5 py-1', !valid && 'text-destructive')}>{status}</span></div>
    <div role="tablist" aria-label="Event details" className="mb-5 flex gap-1 rounded-full bg-muted p-1">{['Overview', 'Recorded data', 'Proof'].map(item => <button key={item} role="tab" aria-selected={tab === item} onClick={() => setTab(item)} className={cn('flex-1 rounded-full px-2 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring', tab === item ? 'bg-card shadow-sm' : 'text-muted-foreground')}>{item}</button>)}</div>
    <div role="tabpanel">
      {tab === 'Overview' ? <><p className="text-sm leading-relaxed">{event.type === 'history.baseline' ? 'Existing campaign data was recorded here. Earlier activity was not cryptographically witnessed.' : record.changedFields.length ? `Updated ${record.changedFields.map(field => FIELDS[field] ?? field).join(', ').toLowerCase()}.` : 'The campaign snapshot is unchanged. This event records an action or a verification checkpoint.'}</p><dl className="mt-5 space-y-4 text-sm"><div><dt className="text-xs text-muted-foreground">Recorded by</dt><dd className="mt-1">{SOURCES[event.source] ?? event.source}</dd></div><div><dt className="text-xs text-muted-foreground">Event type</dt><dd className="mt-1 break-all">{event.type}</dd></div></dl>{event.details !== null && <details className="mt-5 border-t border-border pt-4"><summary className="cursor-pointer text-sm text-muted-foreground">Supporting evidence</summary><JsonValue value={event.details} /></details>}</>
        : tab === 'Recorded data' ? <><p className="text-xs leading-relaxed text-muted-foreground">The campaign snapshot at this event. Sensitive tokens and attachment contents are represented by hashes.</p><RecordedFields record={record} /></>
          : <><p className="mb-2 text-xs text-muted-foreground">Use these references to independently verify the exported evidence.</p><dl>{Object.entries({ 'Event hash': record.hash, 'Previous hash': event.previousHash ?? 'First event', 'Campaign state hash': event.stateHash, 'Event ID': event.eventId, ...(checkpoint ? { 'Signing key fingerprint': checkpoint.keyId, Signature: checkpoint.signature } : {}) }).map(([label, value]) => <ProofValue key={label} label={label} value={value} />)}</dl></>}
    </div>
  </>
}

export function EvidenceRecords({ view }: { view: EvidenceView }) {
  const [selected, setSelected] = useState<EvidenceView['records'][number] | null>(null)
  const [expanded, setExpanded] = useState(false)
  return <>
    <div className="mb-4 mt-8 flex items-center justify-between"><h3 className="font-serif text-2xl tracking-tight">Evidence timeline</h3><span className="text-xs text-muted-foreground">{view.total} recorded {view.total === 1 ? 'event' : 'events'}</span></div>
    <ol className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
      {view.records.slice(0, expanded ? view.records.length : 5).map(record => {
        const { event } = record
        const Icon = event.type === 'signing.activated' ? ShieldCheck : event.source === 'shared-account' ? User : event.source === 'disaster-worker' ? Sparkles : FileText
        return <li key={event.eventId}><button onClick={() => setSelected(record)} className="group flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:gap-4 sm:px-5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"><Icon className="size-4" /></span>
          <div className="min-w-0 flex-1"><p className="text-sm font-medium">{EVENTS[event.type] ?? event.type}</p><p className="mt-1 truncate text-xs text-muted-foreground">{SOURCES[event.source] ?? event.source}<span className="mx-1.5">·</span>{event.type === 'history.baseline' ? 'Imported history' : record.changedFields.length ? `${record.changedFields.length} ${record.changedFields.length === 1 ? 'field' : 'fields'} updated` : `Event #${event.sequence}`}</p></div>
          <time dateTime={event.recordedAt} className="hidden shrink-0 text-xs text-muted-foreground sm:block">{new Date(event.recordedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time><ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </button></li>
      })}
      {!view.records.length && <li className="px-5 py-8 text-center text-sm text-muted-foreground">Campaign events will appear here as activity is recorded.</li>}
    </ol>
    {view.records.length > 5 && <button onClick={() => setExpanded(value => !value)} className="mt-3 w-full rounded-lg py-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{expanded ? 'Show fewer events' : `Show ${view.records.length - 5} more events`}</button>}
    {selected && <EvidenceDialog title={EVENTS[selected.event.type] ?? selected.event.type} onClose={() => setSelected(null)}><EventDetail record={selected} valid={view.verification.valid} /></EvidenceDialog>}
  </>
}
