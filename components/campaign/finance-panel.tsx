'use client'
import { useRef, useState } from 'react'
import {
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  ExternalLink,
  ReceiptText,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
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
import { FundingGraphic } from './funding-graphic'
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
    <Card
      key={action.operationId}
      className="my-3 border-brand/25 bg-brand-soft/30 p-5"
    >
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Review & confirm
      </p>
      <p className="mt-2 font-serif text-2xl tracking-tight">{action.title}</p>
      <p className="my-3 text-2xl font-medium tracking-tight tabular">
        {dollars(action.amountCents)}{' '}
        <span className="text-xs font-normal text-muted-foreground">
          · PayPal sandbox
        </span>
      </p>
      {action.items?.map((p) => (
        <p className="text-sm" key={p.id}>
          {p.qty} × {p.name} · {dollars(priceCents(p) * p.qty)}
        </p>
      ))}
      <p className="my-3 break-words text-xs leading-relaxed text-muted-foreground">
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
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <Card className="flex min-w-0 flex-col gap-5 p-5 sm:p-7">
            <div>
              <FundingGraphic />
              <h2 className="font-serif text-3xl tracking-tight">
                Sponsor a supply bundle
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Choose supplies, then create an itemized funding request for
                your sponsor.
              </p>
            </div>
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
            <div className="overflow-hidden rounded-xl border border-border">
              {products.length === 0 && (
                <p className="p-5 text-sm text-muted-foreground">
                  Create a proposal or purchase to choose supplies for funding.
                </p>
              )}
              {products.map((p) => (
                <label
                  key={p.id}
                  className="flex items-center justify-between gap-3 border-b border-border px-4 py-3.5 text-sm last:border-0"
                >
                  {p.imageUrl && (
                    <img
                      src={p.imageUrl}
                      alt=""
                      className="size-9 shrink-0 rounded-md object-contain"
                    />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-pretty font-medium leading-snug">
                      {p.name}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {dollars(priceCents(p))} per unit
                    </span>
                  </span>
                  <input
                    aria-label={`Sponsor quantity for ${p.name}`}
                    className={inputClass + ' h-9 max-w-20 text-center tabular'}
                    type="number"
                    min="0"
                    max={p.qty}
                    value={selected[p.id] ?? p.qty}
                    onChange={(e) => {
                      setSelected({
                        ...selected,
                        [p.id]: Number(e.target.value),
                      })
                      setPrepared(null)
                    }}
                  />
                </label>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <div>
                <Label htmlFor="funding-sponsor">Sponsor name</Label>
                <input
                  id="funding-sponsor"
                  aria-label="Sponsor name"
                  className={inputClass}
                  placeholder="Sponsor name"
                  value={sponsor}
                  onChange={(e) => {
                    setSponsor(e.target.value)
                    setPrepared(null)
                  }}
                />
              </div>
              <div>
                <Label htmlFor="funding-email">Sponsor email</Label>
                <input
                  id="funding-email"
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
              </div>
            </div>
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-brand"
                checked={emailInvoice}
                onChange={(e) => {
                  setEmailInvoice(e.target.checked)
                  setPrepared(null)
                }}
              />
              Email invoice to sponsor through PayPal
            </label>
            <div className="border-t border-border pt-5">
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-muted-foreground">
                  Funding request
                </span>
                <span className="text-2xl font-medium tracking-tight tabular">
                  {dollars(
                    products.reduce(
                      (sum, p) =>
                        sum + priceCents(p) * (selected[p.id] ?? p.qty),
                      0,
                    ),
                  )}
                </span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Merchandise only. Shipping and tax excluded. Sponsor funding
                does not increase your spending limit.
              </p>
            </div>
            <Pressable
              disabled={
                busy ||
                !products.length ||
                !sponsor.trim() ||
                (emailInvoice && !email.trim())
              }
              onClick={() => work(() => prepare('invoice'))}
              className="self-end"
            >
              Review request <ArrowRight />
            </Pressable>
          </Card>
          <div className="flex min-w-0 flex-col gap-4">
            <div className="flex items-end justify-between gap-3">
              <h2 className="font-serif text-3xl tracking-tight">
                Funding requests
              </h2>
              <span className="text-sm text-muted-foreground tabular">
                {(campaign.funding || []).length} invoices
              </span>
            </div>
            <Card className="flex items-center justify-between gap-4 p-5">
              <div>
                <p className="text-xs text-muted-foreground">
                  Confirmed sponsor funding
                </p>
                <p className="mt-2 text-3xl font-medium tracking-tight tabular">
                  {dollars(totals.funding)}
                </p>
              </div>
              <CheckCircle2 className="size-6 text-brand" />
            </Card>
            {!campaign.funding?.length && (
              <div className="rounded-2xl border border-dashed border-border p-8 text-center">
                <ReceiptText className="mx-auto mb-3 size-6 text-muted-foreground" />
                <p className="text-sm font-medium">
                  Your first sponsor starts here
                </p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Create a funding request to share a PayPal payment link and QR
                  code.
                </p>
              </div>
            )}
            {(campaign.funding || []).map((f) => (
              <Card className="overflow-hidden p-5 sm:p-6" key={f.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Sponsor invoice
                    </p>
                    <h3 className="mt-1 font-serif text-2xl tracking-tight">
                      {f.sponsor}
                    </h3>
                  </div>
                  <p className="text-xl font-medium tracking-tight tabular">
                    {dollars(f.amountCents)}
                  </p>
                </div>
                <p className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                  {f.status} · Received {dollars(f.receivedCents)} · Sandbox{' '}
                  {f.mock ? '· Mock product data' : ''}
                </p>
                {f.paymentUrl && (
                  <a
                    className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-brand hover:underline"
                    target="_blank"
                    rel="noreferrer"
                    href={f.paymentUrl}
                  >
                    Open payment link <ExternalLink className="size-3.5" />
                  </a>
                )}
                {f.emailInvoice && (
                  <p className="my-3 break-words text-xs leading-relaxed text-muted-foreground">
                    {f.emailRequestedAt
                      ? `Email notification requested through PayPal for ${f.email}.`
                      : `Invoice email enabled for ${f.email}. ${f.status === 'DRAFT' ? 'Publish the invoice to request delivery.' : 'Email delivery is not verified.'}`}
                  </p>
                )}
                {f.qr && (
                  <img
                    src={f.qr}
                    alt={`PayPal payment QR for ${f.sponsor}`}
                    className="my-4 size-32 rounded-xl border border-border bg-white p-2"
                  />
                )}
                {f.error && (
                  <p className="text-sm text-destructive">{f.error}</p>
                )}
                <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
                  <Pressable
                    disabled={busy}
                    size="sm"
                    onClick={() =>
                      work(async () =>
                        apply(await api('invoice', { id: f.id })),
                      )
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
          </div>
        </div>
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
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <Card className="min-w-0 p-5 sm:p-7">
            <div className="mb-6">
              <ShieldCheck className="mb-3 size-6 text-brand" />
              <h2 className="font-serif text-3xl tracking-tight">
                Campaign finances
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Spending, refunds, and verified sponsor funding.
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-x-5 gap-y-6 text-sm">
              {Object.entries({
                'Gross purchases': totals.gross,
                'Completed refunds': totals.refunds,
                'Net spending': totals.net,
                'Remaining budget': totals.remaining,
                'Sponsor funding': totals.funding,
              }).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="mt-2 text-2xl font-medium tracking-tight tabular">
                    {dollars(value)}
                  </dd>
                </div>
              ))}
            </dl>
            <Pressable
              className="mt-6"
              variant="secondary"
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
          <Card className="flex min-w-0 flex-col gap-4 p-5 sm:p-7">
            <div className="flex items-center gap-3">
              <span className="inline-flex size-9 items-center justify-center rounded-full bg-brand-soft text-brand">
                <Sparkles className="size-4" />
              </span>
              <h2 className="font-serif text-3xl tracking-tight">
                Finance assistant
              </h2>
            </div>
            <p className="text-xs text-muted-foreground">
              Checks PayPal records and prepares actions. Financial changes
              require your confirmation.
            </p>
            {(campaign.financeMessages || []).map((m) => (
              <div
                key={m.id}
                className="rounded-xl border border-border bg-muted/30 p-4"
              >
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
            <Label htmlFor="finance-question">Ask about this campaign</Label>
            <textarea
              id="finance-question"
              aria-label="Finance question"
              className={inputClass + ' h-24 py-3'}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Did our last payment complete? Prepare a $10 refund for the latest purchase."
            />
            <Pressable
              disabled={busy || !question.trim()}
              onClick={() => work(ask)}
              className="self-end"
            >
              Ask assistant <ArrowUp />
            </Pressable>
          </Card>
        </div>
      )}
      {prepared && actionCard(prepared)}
    </div>
  )
}
