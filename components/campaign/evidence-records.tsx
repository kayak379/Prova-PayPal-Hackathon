'use client'

import type { EvidenceRecord, EvidenceView } from '@/lib/evidence'

const FIELDS: Record<string, string> = {
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
            {FIELDS[field] ?? field} <span className="ml-1 break-all font-mono text-xs text-muted-foreground">{field}</span>
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

export function EvidenceRecords({ view }: { view: EvidenceView }) {
  return (
    <div className="mt-6 border-t border-border pt-5">
      <h4 className="font-medium">Evidence events <span className="ml-1 text-sm font-normal text-muted-foreground">{view.total}</span></h4>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Newest first. Each event commits to the campaign snapshot recorded at that time and the event before it.</p>
      {!view.records.length && <p className="mt-4 text-sm text-muted-foreground">No evidence events have been recorded.</p>}
      <ol className="mt-4 divide-y divide-border">
        {view.records.map(record => {
          const { event, checkpoint } = record
          const status = !view.verification.valid ? (checkpoint ? 'Signature present · verification failed' : 'Unsigned record · verification failed')
            : checkpoint ? 'Signed checkpoint' : record.coveredBySequence ? `Included in signed checkpoint #${record.coveredBySequence}` : 'Unsigned record'
          return (
            <li key={event.eventId} className="py-4 first:pt-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-muted px-2 py-1 font-mono text-xs">#{event.sequence}</span>
                <p className="text-sm font-medium">{EVENTS[event.type] ?? event.type}</p>
                <span className="rounded-full border border-border px-2 py-1 text-xs text-muted-foreground">{status}</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{SOURCES[event.source] ?? event.source} · {new Date(event.recordedAt).toLocaleString()}</p>
              <p className="mt-2 text-sm leading-relaxed">
                {event.type === 'history.baseline' ? 'Existing campaign data was recorded here. Earlier activity was not cryptographically witnessed.'
                  : record.changedFields.length ? `Changed fields: ${record.changedFields.map(field => FIELDS[field] ?? field).join(', ')}.` : 'Campaign data unchanged; this event records an action or checkpoint.'}
              </p>
              {event.type === 'history.baseline' && record.coveredBySequence && view.verification.valid && <p className="mt-1 text-xs text-muted-foreground">The later signature covers this baseline; it does not verify the original historical activity.</p>}
              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-muted-foreground">Event details & recorded campaign data</summary>
                <dl className="mt-3 space-y-2 text-xs">
                  {Object.entries({ 'Event type': event.type, 'Event ID': event.eventId, 'Event hash': record.hash, 'Previous hash': event.previousHash ?? 'First event', 'Campaign state hash': event.stateHash, ...(checkpoint ? { 'Signing key fingerprint': checkpoint.keyId, Signature: checkpoint.signature } : {}) }).map(([label, value]) => (
                    <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 break-all font-mono">{value}</dd></div>
                  ))}
                </dl>
                <p className="mt-4 text-xs font-medium">Event evidence</p>
                <JsonValue value={event.details} />
                <details className="mt-4 rounded-xl border border-border px-3">
                  <summary className="cursor-pointer py-3 text-sm">Campaign snapshot at event #{event.sequence}</summary>
                  <RecordedFields record={record} />
                </details>
              </details>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
