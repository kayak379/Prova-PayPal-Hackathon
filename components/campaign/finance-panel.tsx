'use client'
import { useRef, useState } from 'react'
import type {
  Campaign,
  FinanceAction,
  FundingRequest,
  PurchaseRefund,
} from '@/lib/types'
import { financeTotals } from '@/lib/finance'
import { priceCents } from '@/lib/money'
import { usdPrecise } from '@/lib/format'
import { useStore } from '@/lib/store'
import { Card, Pressable, inputClass, Label } from '../kit'
const dollars = (c: number) => usdPrecise(c / 100)
const upsert = <T extends { id: string }>(list: T[], item: T) => [
  ...list.filter((i) => i.id !== item.id),
  item,
]
export function FinancePanel({
  campaign,
  mode,
  refundOrderId,
}: {
  campaign: Campaign
  mode: 'funding' | 'finance' | 'refund'
  refundOrderId?: string
}) {
  const { updateFinance } = useStore()
  const latest = useRef(campaign)
  latest.current = campaign
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [prepared, setPrepared] = useState<FinanceAction | null>(null)
  const [source, setSource] = useState(
    campaign.proposal ? 'proposal' : campaign.orders[0]?.id || '',
  )
  const products =
    source === 'proposal'
      ? campaign.proposal?.items || []
      : campaign.orders.find((o) => o.id === source)?.items || []
  const [selected, setSelected] = useState<Record<string, number>>({})
  const [sponsor, setSponsor] = useState('')
  const [email, setEmail] = useState('')
  const [emailInvoice, setEmailInvoice] = useState(false)
  const [full, setFull] = useState(true)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [question, setQuestion] = useState('')
  const [orderId, setOrderId] = useState(
    refundOrderId || campaign.orders[0]?.id || '',
  )
  function persist(patch: Partial<Campaign>, message?: string) {
    const c = latest.current
    latest.current = { ...c, ...patch }
    updateFinance(c.id, patch, message)
    try {
      const raw = localStorage.getItem('prova-workspace-v1')
      if (raw) {
        const data = JSON.parse(raw)
        data.campaigns = data.campaigns.map((v: Campaign) =>
          v.id === c.id ? { ...v, ...patch } : v,
        )
        localStorage.setItem('prova-workspace-v1', JSON.stringify(data))
      }
    } catch {
      throw new Error(
        'Could not persist financial operation. Enable browser storage before continuing.',
      )
    }
  }
  async function api(action: string, extra: object = {}, c = latest.current) {
    const r = await fetch('/api/finance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, campaign: c, ...extra }),
    })
    const d = await r.json()
    if (!r.ok) throw new Error(d.error || 'PayPal request failed')
    return d
  }
  async function work(fn: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setBusy(false)
    }
  }
  function apply(data: any) {
    const c = latest.current
    const patch: any = {}
    if (data.funding)
      patch.funding = Array.isArray(data.funding)
        ? data.funding
        : upsert(c.funding || [], data.funding)
    if (data.refund) patch.refunds = upsert(c.refunds || [], data.refund)
    if (data.refunds) patch.refunds = data.refunds
    if (data.verification) patch.verification = data.verification
    persist(patch, 'PayPal sandbox financial records refreshed')
  }
  async function publish(id: string) {
    apply(await api('invoice', { id, publish: true }))
  }
  async function confirm(action: FinanceAction) {
    const operations = latest.current.financeOperations || []
    if (
      operations.some(
        (op) => op.id === action.operationId && op.status === 'completed',
      )
    )
      return
    persist({
      financeOperations: upsert(operations, {
        id: action.operationId,
        action,
        status: 'pending',
      }),
    })
    const result = await api('confirm', { token: action.token })
    apply(result)
    persist(
      {
        financeOperations: latest.current.financeOperations!.map((op) =>
          op.id === action.operationId
            ? {
                ...op,
                status: 'completed',
                resultId: result.funding?.id || result.refund?.id,
              }
            : op,
        ),
      },
      action.kind === 'invoice'
        ? 'Sponsor invoice created in sandbox'
        : 'Purchase refund submitted in sandbox',
    )
    setPrepared(null)
    if (result.funding) await publish(result.funding.id)
  }
  async function prepare(kind: 'invoice' | 'refund') {
    const input =
      kind === 'invoice'
        ? {
            kind,
            source,
            sponsor,
            email,
            emailInvoice,
            items: products
              .map((p) => ({ id: p.id, qty: selected[p.id] ?? p.qty }))
              .filter((p) => p.qty > 0),
          }
        : {
            kind,
            orderId,
            full,
            amountCents: Math.round(Number(amount) * 100),
            reason,
          }
    setPrepared((await api('prepare', { input })).prepared)
  }
  async function ask() {
    const text = question.trim()
    if (!text) return
    const c = latest.current
    const history = c.financeMessages || []
    persist({
      financeMessages: [
        ...history,
        { id: crypto.randomUUID(), role: 'user', text },
      ],
    })
    setQuestion('')
    const r = await fetch('/api/finance/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaign: c, text, history }),
    })
    const d = await r.json()
    if (!r.ok)
      throw new Error(
        d.error || 'Assistant unavailable; guided controls remain available.',
      )
    if (d.patch && Object.keys(d.patch).length) apply(d.patch)
    persist({
      financeMessages: [
        ...(latest.current.financeMessages || []),
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: d.text,
          trace: d.trace,
          actions: d.actions,
        },
      ],
    })
  }
  const totals = financeTotals(campaign)
  const actionCard = (action: FinanceAction) => (
    <Card key={action.operationId} className="my-3 p-4">
      <p className="font-medium">{action.title}</p>
      <p>{dollars(action.amountCents)} · PayPal sandbox</p>
      {action.items?.map((p) => (
        <p className="text-sm" key={p.id}>
          {p.qty} × {p.name} · {dollars(priceCents(p) * p.qty)}
        </p>
      ))}
      <p className="my-2 text-xs text-muted-foreground">
        {action.kind === 'invoice'
          ? `Merchandise only. Shipping and tax excluded. ${action.emailInvoice ? `PayPal will email this invoice to ${action.email}.` : 'No emails will be sent.'}`
          : 'Refunds Prova’s sandbox payment; does not cancel a retailer order.'}
      </p>
      <Pressable
        disabled={
          busy ||
          (campaign.financeOperations || []).some(
            (op) => op.id === action.operationId && op.status === 'completed',
          )
        }
        onClick={() => work(() => confirm(action))}
      >
        Confirm {action.kind === 'invoice' ? 'invoice' : 'refund'}
      </Pressable>
    </Card>
  )
  return (
    <div className="flex flex-col gap-5">
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {busy && (
        <p role="status" className="text-sm animate-pulse">
          Checking PayPal sandbox…
        </p>
      )}
      {(campaign.financeOperations || [])
        .filter((op) => op.status === 'pending')
        .map((op) => (
          <Card key={op.id} className="p-3">
            <p className="text-sm">Pending operation: {op.action.title}</p>
            <Pressable
              disabled={busy}
              onClick={() => work(() => confirm(op.action))}
            >
              Resume operation
            </Pressable>
          </Card>
        ))}
      {mode === 'funding' && (
        <>
          <Card className="flex flex-col gap-3 p-5">
            <h2 className="font-serif text-2xl">Sponsor this supply bundle</h2>
            <Label htmlFor="funding-source">Source</Label>
            <select
              id="funding-source"
              className={inputClass}
              value={source}
              onChange={(e) => {
                setSource(e.target.value)
                setSelected({})
                setPrepared(null)
              }}
            >
              {campaign.proposal && (
                <option value="proposal">Saved proposal</option>
              )}
              {campaign.orders.map((o) => (
                <option key={o.id} value={o.id}>
                  Purchase {o.id}
                </option>
              ))}
            </select>
            {products.map((p) => (
              <label
                key={p.id}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span>
                  {p.name} · {dollars(priceCents(p))}
                </span>
                <input
                  aria-label={`Sponsor quantity for ${p.name}`}
                  className={inputClass + ' max-w-24'}
                  type="number"
                  min="0"
                  max={p.qty}
                  value={selected[p.id] ?? p.qty}
                  onChange={(e) => {
                    setSelected({ ...selected, [p.id]: Number(e.target.value) })
                    setPrepared(null)
                  }}
                />
              </label>
            ))}
            <input
              aria-label="Sponsor name"
              className={inputClass}
              placeholder="Sponsor name"
              value={sponsor}
              onChange={(e) => {
                setSponsor(e.target.value)
                setPrepared(null)
              }}
            />
            <input
              aria-label={
                emailInvoice
                  ? 'Sponsor email required'
                  : 'Sponsor email optional'
              }
              type="email"
              required={emailInvoice}
              className={inputClass}
              placeholder={
                emailInvoice
                  ? 'Sponsor email (required)'
                  : 'Sponsor email (optional)'
              }
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setPrepared(null)
              }}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={emailInvoice}
                onChange={(e) => {
                  setEmailInvoice(e.target.checked)
                  setPrepared(null)
                }}
              />
              Email invoice to sponsor through PayPal
            </label>
            <p className="text-sm text-muted-foreground">
              Merchandise funding only; shipping and tax remain outside this
              request. Funding does not increase the spending limit.
            </p>
            <Pressable
              disabled={
                busy ||
                !products.length ||
                !sponsor.trim() ||
                (emailInvoice && !email.trim())
              }
              onClick={() => work(() => prepare('invoice'))}
            >
              Review funding request
            </Pressable>
          </Card>
          {(campaign.funding || []).map((f) => (
            <Card className="p-5" key={f.id}>
              <h3 className="font-medium">
                {f.sponsor} · {dollars(f.amountCents)}
              </h3>
              <p className="text-sm">
                {f.status} · Received {dollars(f.receivedCents)} · Sandbox{' '}
                {f.mock ? '· Mock product data' : ''}
              </p>
              {f.paymentUrl && (
                <a
                  className="block my-2 underline"
                  target="_blank"
                  rel="noreferrer"
                  href={f.paymentUrl}
                >
                  Open sponsor payment link
                </a>
              )}
              {f.emailInvoice && (
                <p className="my-2 text-xs text-muted-foreground">
                  {f.emailRequestedAt
                    ? `Email notification requested through PayPal for ${f.email}.`
                    : `Invoice email enabled for ${f.email}. ${f.status === 'DRAFT' ? 'Publish the invoice to request delivery.' : 'Email delivery is not verified.'}`}
                </p>
              )}
              {f.qr && (
                <img
                  src={f.qr}
                  alt={`PayPal payment QR for ${f.sponsor}`}
                  className="my-3 size-40"
                />
              )}
              {f.error && <p className="text-sm text-destructive">{f.error}</p>}
              <div className="mt-3 flex gap-2">
                <Pressable
                  disabled={busy}
                  size="sm"
                  onClick={() =>
                    work(async () => apply(await api('invoice', { id: f.id })))
                  }
                >
                  Refresh status
                </Pressable>
                <Pressable
                  disabled={busy}
                  size="sm"
                  variant="secondary"
                  onClick={() => work(() => publish(f.id))}
                >
                  {f.status === 'DRAFT'
                    ? f.emailInvoice
                      ? 'Publish and email invoice'
                      : 'Publish and get QR'
                    : 'Get QR / payment link'}
                </Pressable>
              </div>
            </Card>
          ))}
        </>
      )}
      {mode === 'refund' && (
        <Card className="flex flex-col gap-3 p-4">
          <h3 className="font-medium">Refund sandbox purchase</h3>
          <select
            aria-label="Refund purchase"
            className={inputClass}
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
          >
            {campaign.orders.map((o) => (
              <option value={o.id} key={o.id}>
                {o.id}
              </option>
            ))}
          </select>
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={full}
              onChange={(e) => setFull(e.target.checked)}
            />
            Full remaining refundable amount
          </label>
          {!full && (
            <input
              aria-label="Refund amount USD"
              className={inputClass}
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount in USD"
            />
          )}
          <input
            aria-label="Refund reason"
            className={inputClass}
            placeholder="Reason (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <Pressable
            disabled={busy}
            onClick={() => work(() => prepare('refund'))}
          >
            Review refund
          </Pressable>
          {(campaign.refunds || [])
            .filter((r) => r.orderId === orderId)
            .map((r) => (
              <p className="text-sm" key={r.id}>
                {r.id} · {dollars(r.amountCents)} · {r.status}{' '}
                <button
                  className="underline"
                  disabled={busy}
                  onClick={() =>
                    work(async () => apply(await api('refund', { id: r.id })))
                  }
                >
                  Refresh
                </button>
              </p>
            ))}
        </Card>
      )}
      {mode === 'finance' && (
        <>
          <Card className="p-5">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {Object.entries({
                'Gross purchases': totals.gross,
                'Completed refunds': totals.refunds,
                'Net spending': totals.net,
                'Remaining budget': totals.remaining,
                'Sponsor funding': totals.funding,
              }).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="font-medium">{dollars(value)}</dd>
                </div>
              ))}
            </dl>
            <Pressable
              className="mt-4"
              disabled={busy}
              onClick={() => work(async () => apply(await api('reconcile')))}
            >
              Verify campaign finances
            </Pressable>
            {campaign.verification && (
              <div className="mt-4 text-sm">
                <p>
                  Last verified{' '}
                  {new Date(campaign.verification.at).toLocaleString()}
                </p>
                <ul className="list-disc pl-4">
                  {campaign.verification.findings.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
                <p className="mt-2 text-muted-foreground">
                  {campaign.verification.reporting}
                </p>
              </div>
            )}
          </Card>
          <Card className="flex flex-col gap-4 p-5">
            <h2 className="font-serif text-2xl">Campaign finance assistant</h2>
            <p className="text-xs text-muted-foreground">
              Checks PayPal records and prepares actions. Financial changes
              require your confirmation.
            </p>
            {(campaign.financeMessages || []).map((m) => (
              <div key={m.id} className="rounded-xl bg-muted/50 p-3">
                <p className="mb-1 text-xs font-medium">
                  {m.role === 'user' ? 'You' : 'Assistant'}
                </p>
                <p className="whitespace-pre-wrap text-sm">{m.text}</p>
                {m.trace?.map((t, i) => (
                  <p className="mt-1 text-xs text-muted-foreground" key={i}>
                    {t.tool} → {t.summary}
                  </p>
                ))}
                {m.actions?.map(actionCard)}
              </div>
            ))}
            <textarea
              aria-label="Finance question"
              className={inputClass + ' h-24 py-3'}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Did our last payment complete? Prepare a $10 refund for the latest purchase."
            />
            <Pressable
              disabled={busy || !question.trim()}
              onClick={() => work(ask)}
            >
              Ask assistant
            </Pressable>
          </Card>
        </>
      )}
      {prepared && actionCard(prepared)}
    </div>
  )
}
