'use client'
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  Check,
  ExternalLink,
  ReceiptText,
  ShieldCheck,
} from 'lucide-react'
import type {
  Campaign,
  FinanceAction,
  FinanceDraft,
  FinanceResult,
  PurchaseRefund,
} from '@/lib/types'
import { financeTotals } from '@/lib/finance'
import { priceCents, totalsCents } from '@/lib/money'
import { usdPrecise } from '@/lib/format'
import { useStore } from '@/lib/store'
import { Card, Pressable, inputClass, Label } from '../kit'
import { FundingGraphic } from './funding-graphic'
import { FinanceMoney } from './finance-money'
import { PayPalWordmark } from '../brand'
import { FundingReview } from './funding-review'
import { RefundFlow } from './refund-flow'
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
  const { saveFinanceDraft, refresh, flush } = useStore()
  const latest = useRef(campaign)
  latest.current = campaign
  const [busy, setBusy] = useState(false)
  const workLock = useRef(false)
  const [activity, setActivity] = useState('Checking PayPal…')
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
  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const reducedMotion = useReducedMotion()
  const conversation = useRef<HTMLDivElement>(null)
  const followMessages = useRef(true)
  const composer = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const list = conversation.current
    if (list && followMessages.current)
      list.scrollTo({
        top: list.scrollHeight,
        behavior: reducedMotion ? 'instant' : 'smooth',
      })
  }, [campaign.financeMessages, campaign.refunds, asking, reducedMotion])
  function sendMessage() {
    if (!question.trim() || workLock.current) return
    followMessages.current = true
    void work(async () => {
      setAsking(true)
      try {
        await ask()
      } finally {
        setAsking(false)
        requestAnimationFrame(() => composer.current?.focus())
      }
    }, 'Checking campaign records…')
  }
  const [orderId, setOrderId] = useState(
    refundOrderId || campaign.orders[0]?.id || '',
  )
  async function persist(patch: FinanceDraft) {
    await saveFinanceDraft(latest.current.id, patch)
    latest.current = { ...latest.current, ...patch }
  }
  async function api(action: string, extra: object = {}, c = latest.current) {
    await flush()
    const r = await fetch('/api/finance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, campaign: c, ...extra }),
    })
    const d = await r.json()
    if (!r.ok) throw new Error(d.error || 'PayPal request failed')
    await refresh()
    return d
  }
  async function work(
    fn: () => Promise<void>,
    detail = 'Checking PayPal…',
  ) {
    if (workLock.current) return
    workLock.current = true
    setActivity(detail)
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
    } finally {
      workLock.current = false
      setBusy(false)
    }
  }
  function applyResult(data: FinanceResult) {
    const c = latest.current
    const patch: Partial<Pick<Campaign, 'funding' | 'refunds' | 'verification'>> = {}
    if (data.funding)
      patch.funding = Array.isArray(data.funding)
        ? data.funding
        : upsert(c.funding || [], data.funding)
    if (data.refund) patch.refunds = upsert(c.refunds || [], data.refund)
    if (data.refunds) patch.refunds = data.refunds
    if (data.verification) patch.verification = data.verification
    // The API already saved these records. Keep the local ref current for the next action.
    latest.current = { ...c, ...patch }
  }
  async function publish(id: string) {
    applyResult(await api('invoice', { id, publish: true }))
  }
  async function confirm(action: FinanceAction) {
    const operations = latest.current.financeOperations || []
    if (
      operations.some(
        (op) => op.id === action.operationId && op.status === 'completed',
      )
    )
      return
    await persist({
      financeOperations: upsert(operations, {
        id: action.operationId,
        action,
        status: 'pending',
      }),
    })
    const result = await api('confirm', { token: action.token })
    applyResult(result)
    await persist({
      financeOperations: latest.current.financeOperations!.map((op) =>
        op.id === action.operationId
          ? {
              ...op,
              status: 'completed',
              resultId: result.funding?.id || result.refund?.id,
            }
          : op,
      ),
    })
    setPrepared(null)
    if (result.funding) await publish(result.funding.id)
  }
  async function prepareInvoice() {
    const input = {
      kind: 'invoice',
      source,
      sponsor,
      email: emailInvoice ? email : '',
      emailInvoice,
      items: products
        .map((p) => ({ id: p.id, qty: selected[p.id] ?? p.qty }))
        .filter((p) => p.qty > 0),
    }
    setPrepared((await api('prepare', { input })).prepared)
  }
  async function ask() {
    const text = question.trim()
    if (!text) return
    const c = latest.current
    const history = c.financeMessages || []
    await persist({
      financeMessages: [
        ...history,
        { id: crypto.randomUUID(), role: 'user', text },
      ],
    })
    const r = await fetch('/api/finance/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaign: c, text, history }),
    })
    const d = await r.json()
    if (!r.ok) {
      setQuestion(text)
      throw new Error(
        d.error || 'Assistant unavailable; guided controls remain available.',
      )
    }
    await refresh()
    if (d.patch) applyResult(d.patch)
    await persist({
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
    setQuestion('')
  }
  const totals = financeTotals(campaign)
  const refundResult = (refund: PurchaseRefund) => (
    <div
      key={refund.id}
      className="my-3 rounded-xl border border-brand/25 bg-brand-soft/30 p-4"
      role="status"
    >
      <p className="font-medium">
        {refund.status === 'COMPLETED'
          ? 'Refund verified by PayPal'
          : `Refund status: ${refund.status}`}
      </p>
      <p className="mt-2 text-xl tabular">
        {dollars(refund.amountCents)}
      </p>
      <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
        Refund: {refund.id}
        <br />
        Capture: {refund.captureId}
      </p>
      <p className="mt-3 text-sm">
        {refund.status === 'COMPLETED'
          ? `${dollars(refund.amountCents)} deducted from net spending and credited back toward the campaign budget.`
          : 'Budget is unchanged until PayPal confirms completion.'}
      </p>
      <p className="mt-2 text-sm">
        Net spending: {dollars(totals.net)} · Remaining budget:{' '}
        {dollars(totals.remaining)}
      </p>
      <Pressable
        className="mt-3"
        size="sm"
        variant="secondary"
        disabled={busy}
        onClick={() =>
          work(async () => applyResult(await api('refund', { id: refund.id })))
        }
      >
        Refresh refund status
      </Pressable>
    </div>
  )
  const actionCard = (action: FinanceAction) => {
    const result = (campaign.refunds || []).find(
      (r) => r.operationId === action.operationId,
    )
    if (result) return refundResult(result)
    const completed = (campaign.financeOperations || []).some(
      (op) => op.id === action.operationId && op.status === 'completed',
    )
    const pending = (campaign.financeOperations || []).some(
      (op) => op.id === action.operationId && op.status === 'pending',
    )
    return (
      <Card
        key={action.operationId}
        className="my-3 border-brand/25 bg-brand-soft/30 p-5"
      >
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Review & confirm
        </p>
        <p className="mt-2 font-serif text-2xl tracking-tight">
          {action.title}
        </p>
        <p className="my-3 text-2xl font-medium tracking-tight tabular">
          {dollars(action.amountCents)}{' '}
          <span className="text-xs font-normal text-muted-foreground">
            · PayPal
          </span>
        </p>
        {action.items?.map((p) => (
          <p className="text-sm" key={p.id}>
            {p.qty} × {p.name} · {dollars(priceCents(p) * p.qty)}
          </p>
        ))}
        {action.charges && (
          <dl className="my-3 grid grid-cols-2 gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
            <dt>Estimated shipping</dt>
            <dd className="text-right tabular">
              {dollars(action.charges.shipping)}
            </dd>
            <dt>Estimated tax</dt>
            <dd className="text-right tabular">
              {dollars(action.charges.tax)}
            </dd>
          </dl>
        )}
        <p className="my-3 break-words text-xs leading-relaxed text-muted-foreground">
          {action.kind === 'invoice'
            ? `Includes estimated shipping and tax. ${action.emailInvoice ? `PayPal will email this invoice to ${action.email}.` : 'No emails will be sent.'}`
            : 'Refunds the original payment; does not cancel a retailer order.'}
        </p>
        {action.kind === 'refund' && (
          <div className="mb-3 text-sm">
            <p className="break-all text-xs text-muted-foreground">
              Purchase: {action.orderId || 'Verified campaign purchase'}
              {action.captureId && <> · Capture: {action.captureId}</>}
            </p>
            <p className="mt-2">
              After completion, net spending decreases by{' '}
              {dollars(action.amountCents)}. Budget is restored only when PayPal
              confirms completion.
            </p>
          </div>
        )}
        <Pressable
          disabled={
            busy ||
            (campaign.financeOperations || []).some(
              (op) => op.id === action.operationId && op.status === 'completed',
            )
          }
          onClick={() =>
            work(
              () => confirm(action),
              action.kind === 'refund'
                ? 'Submitting the confirmed refund and verifying its PayPal status…'
                : 'Creating your confirmed sponsor invoice…',
            )
          }
        >
          {completed
            ? 'Confirmed'
            : pending
              ? 'Retry same operation'
              : `Confirm ${action.kind === 'invoice' ? 'invoice' : 'refund'}`}
        </Pressable>
      </Card>
    )
  }
  if (mode === 'refund') return <RefundFlow campaign={campaign} orderId={refundOrderId || orderId} />
  return (
    <div className="flex flex-col gap-5">
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {busy && !asking && (
        <p role="status" className="text-sm animate-pulse">
          {activity}
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
            <div>
              <Label htmlFor="funding-sponsor">
                Sponsor name{' '}
                <span aria-hidden="true" className="text-destructive">
                  *
                </span>
              </Label>
              <input
                id="funding-sponsor"
                aria-label="Sponsor name"
                required
                className={inputClass}
                placeholder="Sponsor name"
                value={sponsor}
                disabled={busy}
                onChange={(e) => {
                  setSponsor(e.target.value)
                  setPrepared(null)
                }}
              />
            </div>
            <label
              className={`flex w-fit cursor-pointer items-center gap-2.5 py-0.5 text-sm text-muted-foreground transition-colors hover:text-foreground ${busy ? 'pointer-events-none opacity-50' : ''}`}
            >
              <input
                type="checkbox"
                aria-label="Email invoice to sponsor through PayPal"
                aria-controls="funding-email-area"
                aria-expanded={emailInvoice}
                className="peer sr-only"
                checked={emailInvoice}
                disabled={busy}
                onChange={(e) => {
                  setEmailInvoice(e.target.checked)
                  setPrepared(null)
                }}
              />
              <span
                aria-hidden="true"
                className={`inline-flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors duration-200 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-card ${emailInvoice ? 'border-brand bg-brand text-brand-foreground' : 'border-input bg-card'}`}
              >
                <motion.span
                  initial={false}
                  animate={{
                    opacity: emailInvoice ? 1 : 0,
                    scale: emailInvoice ? 1 : 0.6,
                  }}
                  transition={{ duration: 0.18 }}
                >
                  <Check className="size-3.5" strokeWidth={2.5} />
                </motion.span>
              </span>
              <span className="min-w-0 leading-relaxed">
                Email invoice to sponsor through{' '}
                <PayPalWordmark className="align-baseline text-[1em]" />
              </span>
            </label>
            <AnimatePresence initial={false}>
              {emailInvoice && (
                <motion.div
                  id="funding-email-area"
                  key="sponsor-email"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{
                    duration: reducedMotion ? 0 : 0.25,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className="overflow-hidden"
                >
                  <div className="pb-1">
                    <Label htmlFor="funding-email">Sponsor email</Label>
                    <input
                      id="funding-email"
                      aria-label="Sponsor email required"
                      type="email"
                      required={emailInvoice}
                      disabled={busy}
                      className={inputClass}
                      placeholder="sponsor@example.com"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value)
                        setPrepared(null)
                      }}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <div className="border-t border-border pt-5">
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-muted-foreground">
                  Funding request
                </span>
                <span className="text-2xl font-medium tracking-tight tabular">
                  {dollars(
                    totalsCents(
                      products.map((p) => ({
                        ...p,
                        qty: selected[p.id] ?? p.qty,
                      })),
                    ).total,
                  )}
                </span>
              </div>
            </div>
            <Pressable
              disabled={
                busy ||
                !products.length ||
                !sponsor.trim() ||
                (emailInvoice && !email.trim())
              }
              onClick={() => work(() => prepareInvoice())}
              className="self-end"
            >
              Review request <ArrowRight />
            </Pressable>
          </Card>
          <div className="flex min-w-0 flex-col gap-4">
            <Card className="p-5 sm:p-7">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <h2 className="font-serif text-3xl tracking-tight">
                  Funding requests
                </h2>
                <span className="text-sm text-muted-foreground tabular">
                  {(campaign.funding || []).length}{' '}
                  {(campaign.funding || []).length === 1
                    ? 'invoice'
                    : 'invoices'}
                </span>
              </div>
              <div className="mt-5 flex items-center justify-between gap-4 border-t border-border pt-5">
                <div>
                  <p className="text-xs text-muted-foreground">
                    Confirmed sponsor funding
                  </p>
                  <p className="mt-2 text-3xl font-medium tracking-tight tabular">
                    {dollars(totals.funding)}
                  </p>
                </div>
                <CheckCircle2 className="size-6 text-brand" />
              </div>
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
                  {f.status} · Received {dollars(f.receivedCents)}
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
                        applyResult(await api('invoice', { id: f.id })),
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
              onClick={() => work(async () => applyResult(await api('reconcile')))}
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
          <Card className="flex min-w-0 flex-col overflow-hidden">
            <div className="flex items-center gap-3 px-5 pt-5 sm:px-6">
              <FinanceMoney />
              <h2 className="font-serif text-3xl tracking-tight">
                Finance assistant
              </h2>
            </div>
            <p className="border-b border-border px-5 pb-5 pt-3 text-xs leading-relaxed text-muted-foreground sm:px-6">
              Checks PayPal records and prepares actions. Financial changes
              require your confirmation.
            </p>
            <div
              ref={conversation}
              role="log"
              aria-label="Conversation with finance assistant"
              aria-live="polite"
              aria-relevant="additions"
              onScroll={() => {
                const list = conversation.current
                if (list)
                  followMessages.current =
                    list.scrollHeight - list.scrollTop - list.clientHeight < 80
              }}
              className="flex h-[380px] min-h-0 flex-col gap-5 overflow-y-auto overscroll-contain px-4 py-5 sm:h-[440px] sm:px-6"
            >
              {!campaign.financeMessages?.length && (
                <div className="my-auto px-3 py-8 text-center">
                  <ReceiptText className="mx-auto mb-4 size-7 text-brand" />
                  <p className="font-serif text-2xl">Let’s check the numbers</p>
                  <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
                    Ask whether a sponsor paid, check a purchase, or request a
                    refund for review.
                  </p>
                </div>
              )}
              {(campaign.financeMessages || []).map((m) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: reducedMotion ? 0 : 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: reducedMotion ? 0 : 0.25,
                    ease: 'easeOut',
                  }}
                  className={
                    m.role === 'user'
                      ? 'ml-auto w-fit max-w-[90%]'
                      : 'mr-auto min-w-0 max-w-[95%]'
                  }
                >
                  <p
                    className={
                      'mb-1.5 px-1 text-[11px] font-medium text-muted-foreground ' +
                      (m.role === 'user' ? 'text-right' : '')
                    }
                  >
                    {m.role === 'user' ? 'You' : 'Prova'}
                  </p>
                  <div
                    className={
                      m.role === 'user'
                        ? 'rounded-2xl rounded-tr-sm bg-brand px-4 py-3 text-brand-foreground'
                        : 'rounded-2xl rounded-tl-sm bg-muted/60 px-4 py-3'
                    }
                  >
                    <ChatMessage text={m.text} />
                  </div>
                  {!!m.trace?.length && (
                    <details className="mt-2 px-1 text-xs text-muted-foreground">
                      <summary className="cursor-pointer py-1">
                        PayPal checks · {m.trace.length}
                      </summary>
                      {m.trace.map((t, i) => (
                        <p
                          className="mt-2 break-words border-l border-border pl-3"
                          key={i}
                        >
                          {t.tool} → {t.summary}
                        </p>
                      ))}
                    </details>
                  )}
                  {m.actions?.map(actionCard)}
                </motion.div>
              ))}
              <AnimatePresence initial={false}>
                {asking && (
                  <motion.div
                    key="typing"
                    role="status"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="mr-auto"
                  >
                    <p className="mb-1.5 px-1 text-[11px] text-muted-foreground">
                      Prova
                    </p>
                    <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm bg-muted/60 px-4 py-3">
                      <span aria-hidden="true" className="flex gap-1">
                        {[0, 1, 2].map((i) => (
                          <motion.span
                            key={i}
                            className="size-1.5 rounded-full bg-brand/70"
                            animate={
                              reducedMotion
                                ? {}
                                : { opacity: [0.35, 1, 0.35], y: [0, -3, 0] }
                            }
                            transition={{
                              duration: 1,
                              repeat: Infinity,
                              delay: i * 0.15,
                            }}
                          />
                        ))}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Checking campaign records…
                      </span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <form
              className="border-t border-border bg-card px-4 pb-4 pt-3 sm:px-6"
              onSubmit={(e) => {
                e.preventDefault()
                sendMessage()
              }}
            >
              <label htmlFor="finance-question" className="sr-only">
                Message finance assistant
              </label>
              <div className="flex items-end gap-2 rounded-2xl border border-input bg-background p-2 transition-shadow focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/10">
                <textarea
                  ref={composer}
                  id="finance-question"
                  aria-label="Finance question"
                  rows={2}
                  className="min-h-12 max-h-36 min-w-0 flex-1 resize-y bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-60"
                  value={question}
                  disabled={busy}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Ask about this campaign…"
                  onKeyDown={(e) => {
                    if (
                      e.key === 'Enter' &&
                      !e.shiftKey &&
                      !e.nativeEvent.isComposing &&
                      e.keyCode !== 229
                    ) {
                      e.preventDefault()
                      sendMessage()
                    }
                  }}
                />
                <Pressable
                  disabled={busy || !question.trim()}
                  type="submit"
                  size="icon"
                  variant="brand"
                  aria-label="Send message"
                >
                  <ArrowUp />
                </Pressable>
              </div>
              <p className="mt-2 px-1 text-[11px] text-muted-foreground">
                Enter to send · Shift + Enter for a new line
              </p>
            </form>
          </Card>
        </div>
      )}
      {mode === 'funding' ? (
        <FundingReview
          action={prepared}
          busy={busy}
          activity={activity}
          error={error}
          pending={(campaign.financeOperations || []).some(
            (op) => op.id === prepared?.operationId && op.status === 'pending',
          )}
          onClose={() => setPrepared(null)}
          onConfirm={() => {
            if (prepared)
              void work(
                () => confirm(prepared),
                'Creating and publishing your sponsor invoice…',
              )
          }}
        />
      ) : prepared && actionCard(prepared)}
    </div>
  )
}

function ChatMessage({ text }: { text: string }) {
  return (
    <div className="space-y-2 break-words text-sm leading-relaxed [overflow-wrap:anywhere]">
      {text.split('\n').map((line, i) => (
        <p key={i} className={line ? '' : 'h-2'}>
          {line
            .replace(/^\s*[-*]\s+/, '• ')
            .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
            .map((part, j) =>
              part.startsWith('**') && part.endsWith('**') ? (
                <strong key={j} className="font-semibold">
                  {part.slice(2, -2)}
                </strong>
              ) : part.startsWith('`') && part.endsWith('`') ? (
                <code
                  key={j}
                  className="rounded bg-foreground/5 px-1 font-mono text-xs"
                >
                  {part.slice(1, -1)}
                </code>
              ) : (
                part
              ),
            )}
        </p>
      ))}
    </div>
  )
}
