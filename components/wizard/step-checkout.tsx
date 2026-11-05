'use client'

import { AnimatePresence, motion } from 'motion/react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Lock,
  MapPin,
  ShieldCheck,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Card, inputClass, Pressable, PressableLink } from '../kit'
import { Modal } from '../modal'
import { PayPalWordmark } from '../brand'
import { spring } from '../motion-provider'
import { usdPrecise as usd } from '@/lib/format'
import { financeTotals } from '@/lib/finance'
import { useStore } from '@/lib/store'
import type { Order, Plan } from '@/lib/types'
import { cn } from '@/lib/utils'
import type { Draft } from './campaign-wizard'

import { paypalSDK } from '@/lib/paypal-client'
import { totalsCents } from '@/lib/money'
const PHRASE = 'I approve'
type Pending = { orderId: string; ticket: string; approvalUrl: string }
async function post(url: string, input: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const data = await res.json()
  if (!res.ok || data.error)
    throw new Error(data.error || 'Payment request failed')
  return data
}
export function StepCheckout({
  plan,
  draft,
  existingId,
  onPayingChange,
  onPaymentComplete,
  onBack,
}: {
  plan: Plan
  draft: Draft
  existingId?: string
  prompt: string
  onPayingChange: (b: boolean) => void
  onPaymentComplete: (b: boolean) => void
  onBack: () => void
}) {
  const { settings, refresh, flush, campaigns } = useStore()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState<Order | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const started = useRef(false)
  const [savedEmail, setSavedEmail] = useState('')
  const [approveOpen, setApproveOpen] = useState(false)
  const [paymentStage, setPaymentStage] = useState('')
  const paymentLock = useRef(false)
  const captureLock = useRef(false)
  const totals = totalsCents(plan.items)
  const groups = [...new Set(plan.items.map((p) => p.supplier))]
  useEffect(() => {
    void paypalSDK().catch(() => {})
    fetch('/api/paypal/vault')
      .then((r) => r.json())
      .then((wallet) => setSavedEmail(wallet.saved ? wallet.email : ''))
      .catch(() => {})
  }, [])
  const callbacks = useRef({ onPayingChange, onPaymentComplete })
  callbacks.current = { onPayingChange, onPaymentComplete }
  async function capture(payment: Pending) {
    if (captureLock.current) return
    captureLock.current = true
    setPaymentStage('Verifying the captured amount with PayPal…')
    setBusy(true)
    setError('')
    callbacks.current.onPayingChange(true)
    try {
      const result = await post('/api/checkout/capture', payment)
      if (result.campaignId !== existingId)
        throw new Error('Payment belongs to another campaign.')
      await refresh()
      setPending(null)
      setReceipt(result.receipt)
      callbacks.current.onPaymentComplete(true)
      window.history.replaceState(
        null,
        '',
        `/campaigns/new?campaign=${existingId}`,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Payment verification failed')
    } finally {
      captureLock.current = false
      paymentLock.current = false
      setBusy(false)
      callbacks.current.onPayingChange(false)
    }
  }
  useEffect(() => {
    if (started.current) return
    started.current = true
    void (async () => {
      try {
        const response = await fetch('/api/checkout/pending?campaign=' + encodeURIComponent(existingId || ''))
        if (!response.ok) throw new Error('Could not restore checkout.')
        const payment = await response.json()
        if (!payment) return
        setPending(payment)
        const params = new URLSearchParams(window.location.search)
        if (params.get('payment') === 'cancelled') {
          setError('PayPal approval was cancelled. Resume approval or verify before starting another payment.')
          return
        }
        if (params.get('payment') === 'approved' && params.get('token') !== payment.orderId) throw new Error('Payment order mismatch.')
        if (params.get('payment') === 'approved' || payment.requiresApproval === false) await capture(payment)
      } catch (e) { setError(e instanceof Error ? e.message : 'Could not restore checkout.') }
    })()
  }, [])
  async function approvePayment(payment: Pending) {
    const sdk = await paypalSDK()
    const eligible = await sdk.findEligibleMethods({ currencyCode: 'USD' })
    if (!eligible.isEligible('paypal'))
      throw new Error('PayPal is unavailable in this browser.')
    const session = sdk.createPayPalOneTimePaymentSession({
      onApprove: async ({ orderId }) => {
        if (orderId !== payment.orderId)
          throw new Error('Payment order mismatch.')
        await capture(payment)
      },
      onCancel: () => {
        setPending(null)
        paymentLock.current = false
        setBusy(false)
        onPayingChange(false)
        setError('PayPal approval was cancelled. You can retry.')
      },
      onError: () => {
        paymentLock.current = false
        setBusy(false)
        onPayingChange(false)
        setError(
          'PayPal approval failed. Please resume or verify your payment.',
        )
      },
    })
    await session.start(
      { presentationMode: 'modal' },
      Promise.resolve({ orderId: payment.orderId }),
    )
  }
  async function resumePayment() {
    if (!pending || paymentLock.current) return
    paymentLock.current = true
    setPaymentStage('Waiting for PayPal approval…')
    setBusy(true)
    setError('')
    onPayingChange(true)
    try {
      await approvePayment(pending)
    } catch (e) {
      paymentLock.current = false
      setBusy(false)
      onPayingChange(false)
      setError(e instanceof Error ? e.message : 'PayPal approval failed')
    }
  }
  async function pay() {
    if (paymentLock.current) return
    paymentLock.current = true
    setPaymentStage('Creating your sandbox payment…')
    setBusy(true)
    setError('')
    onPayingChange(true)
    try {
      if (!existingId) throw new Error('Save the campaign before checkout.')
      await flush()
      const result = await post('/api/checkout/create', {
        campaignId: existingId,
        snapshot: plan.snapshot,
        items: plan.items.map((p) => ({ id: p.id, qty: p.qty })),
      })
      const payment: Pending = {
        orderId: result.orderId,
        ticket: result.ticket,
        approvalUrl: result.approvalUrl,
      }
      await refresh()
      setPending(payment)
      if (result.requiresApproval === false) await capture(payment)
      else {
        setPaymentStage('Waiting for PayPal approval…')
        await approvePayment(payment)
      }
    } catch (e) {
      paymentLock.current = false
      setError(e instanceof Error ? e.message : 'Checkout failed')
      setBusy(false)
      onPayingChange(false)
    }
  }
  const phase = receipt ? 'done' : busy ? 'processing' : 'ready'
  const suppliers = groups
  const total = totals.total / 100
  const orders: Order[] = receipt
    ? [receipt]
    : groups.map((supplier) => ({
        id: supplier,
        supplier,
        items: plan.items.filter((p) => p.supplier === supplier),
        paypalTxn: 'Awaiting PayPal',
        total: plan.items
          .filter((p) => p.supplier === supplier)
          .reduce((sum, p) => sum + p.unitPrice * p.qty, 0),
        status: 'processing',
        createdAt: Date.now(),
      }))
  const authorize = () => {
    setApproveOpen(false)
    void pay()
  }
  return (
    <AnimatePresence mode="wait" initial={false}>
      {receipt && existingId ? (
        <motion.div
          key="verified"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        >
          <Receipt
            orders={[receipt]}
            total={receipt.total}
            campaignId={existingId}
            remainingCents={
              campaigns.find((c) => c.id === existingId)
                ? financeTotals(campaigns.find((c) => c.id === existingId)!)
                    .remaining
                : undefined
            }
          />
        </motion.div>
      ) : (
        <motion.div
          key="checkout"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
          className="flex flex-col gap-6"
        >
          {plan.mock && (
            <div
              role="status"
              className="rounded-xl border border-warning-border bg-warning p-4 text-sm text-warning-foreground"
            >
              <p className="font-semibold">Mock data — sandbox checkout</p>
              <p>
                Products and prices are sample data. PayPal will process a real
                sandbox test transaction; no goods will be ordered.
              </p>
            </div>
          )}
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          {pending && !busy && (
            <div className="flex gap-3">
              <Pressable size="sm" onClick={() => capture(pending)}>
                Verify payment
              </Pressable>
              <button
                type="button"
                className="text-sm underline"
                onClick={resumePayment}
              >
                Resume PayPal approval
              </button>
            </div>
          )}
          <h1 className="font-serif text-4xl tracking-tight sm:text-5xl">
            {phase === 'processing' ? 'Completing payment' : 'Checkout'}
          </h1>

          <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
            <Card className="overflow-hidden">
              <ul>
                {(phase === 'processing'
                  ? orders.map((o) => o.supplier)
                  : suppliers
                ).map((s, i) => {
                  const items = plan.items.filter((it) => it.supplier === s)
                  const sub =
                    phase === 'processing'
                      ? orders[i].total
                      : items.reduce((a, it) => a + it.qty * it.unitPrice, 0)
                  return (
                    <li
                      key={s}
                      className="flex items-center gap-4 border-b border-border px-5 py-4 last:border-0"
                    >
                      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-border">
                        <ShieldCheck className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{s}</p>
                        <p className="text-xs text-muted-foreground">
                          {items
                            .map(
                              (it) => `${it.qty.toLocaleString()} × ${it.name}`,
                            )
                            .join(', ')}
                        </p>
                      </div>
                      <span className="text-sm tabular">{usd(sub)}</span>
                    </li>
                  )
                })}
              </ul>
              <div className="flex flex-col gap-2 border-t border-border bg-muted/40 px-5 py-4 text-sm text-muted-foreground sm:flex-row sm:gap-6">
                <span className="inline-flex items-center gap-2">
                  <MapPin className="size-3.5" /> {draft.address}
                </span>
                <span className="inline-flex items-center gap-2 tabular">
                  <ShieldCheck className="size-3.5" /> EIN {draft.taxId}
                </span>
              </div>
            </Card>

            <aside className="xl:sticky xl:top-26 xl:self-start">
              <div className="rounded-2xl border border-border bg-card p-5">
                <div className="flex items-center justify-between">
                  <PayPalWordmark className="text-xl" />
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Lock className="size-3" /> Secure
                  </span>
                </div>
                <div className="mt-5 flex items-center gap-3 rounded-xl bg-muted/60 p-3">
                  <span className="inline-flex size-9 items-center justify-center rounded-full bg-paypal-navy text-sm font-semibold text-white">
                    {settings.orgName.charAt(0)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {savedEmail || settings.orgName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {savedEmail
                        ? 'Saved PayPal · Sandbox'
                        : 'PayPal · Sandbox'}
                    </p>
                  </div>
                </div>
                <p className="mt-5 text-xs text-muted-foreground">You pay</p>
                <p className="text-3xl font-medium tracking-tight tabular">
                  {usd(total)}
                </p>
                <p className="text-xs text-muted-foreground">
                  1 sandbox payment · fulfillment simulated
                </p>

                {phase === 'processing' ? (
                  <div
                    role="status"
                    className="mt-5 flex items-center gap-3 rounded-xl bg-muted p-4"
                  >
                    <Loader2 className="size-5 shrink-0 animate-spin" />
                    <p className="text-sm">{paymentStage}</p>
                  </div>
                ) : (
                  <>
                    <motion.button
                      disabled={!!pending || !plan.snapshot}
                      onClick={() => setApproveOpen(true)}
                      whileHover={{ y: -1 }}
                      whileTap={{ scale: 0.97 }}
                      style={{ borderRadius: 999 }}
                      className="mt-5 flex h-12 w-full items-center justify-center gap-1.5 bg-paypal-gold text-[15px] font-semibold text-paypal-navy outline-none focus-visible:ring-2 focus-visible:ring-paypal-blue focus-visible:ring-offset-2"
                    >
                      Pay with{' '}
                      <span className="font-extrabold italic">PayPal</span>
                    </motion.button>
                    <Pressable
                      variant="ghost"
                      size="sm"
                      className="mt-2 w-full"
                      onClick={onBack}
                    >
                      <ArrowLeft /> Back to proposal
                    </Pressable>
                  </>
                )}
              </div>
            </aside>
          </div>

          <Modal
            open={approveOpen}
            onClose={() => setApproveOpen(false)}
            title="Authorize payment"
          >
            <ApproveForm
              total={total}
              count={suppliers.length}
              onApprove={authorize}
            />
          </Modal>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function ApproveForm({
  total,
  count,
  onApprove,
}: {
  total: number
  count: number
  onApprove: () => void
}) {
  const [value, setValue] = useState('')
  const match = value.trim().toLowerCase() === PHRASE.toLowerCase()
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (match) onApprove()
      }}
      className="flex flex-col gap-4"
    >
      <p className="text-sm leading-relaxed text-muted-foreground">
        Approve one PayPal sandbox payment of{' '}
        <span className="font-medium text-foreground tabular">
          {usd(total)}
        </span>{' '}
        for supplies from {count} {count === 1 ? 'retailer' : 'retailers'}.
        Fulfillment is simulated; no goods will be ordered.
      </p>
      <div>
        <label
          htmlFor="approve"
          className="mb-2 block text-[13px] font-medium text-muted-foreground"
        >
          Type <span className="font-semibold text-foreground">{PHRASE}</span>{' '}
          to confirm
        </label>
        <div className="relative">
          <input
            id="approve"
            autoFocus
            autoComplete="off"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={PHRASE}
            className={cn(
              inputClass,
              'pr-11',
              match &&
                'border-success focus:border-success focus:shadow-[0_0_0_4px_var(--success-soft)]',
            )}
          />
          <AnimatePresence>
            {match && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                transition={spring}
                className="absolute right-3 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-full bg-success text-success-foreground"
              >
                <Check className="size-3.5" strokeWidth={3} />
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>
      <motion.button
        type="submit"
        disabled={!match}
        whileTap={match ? { scale: 0.97 } : undefined}
        className="flex h-12 items-center justify-center gap-2 rounded-full bg-paypal-blue text-[15px] font-semibold text-white transition-opacity disabled:opacity-30"
      >
        <Lock className="size-4" /> Authorize {usd(total)}
      </motion.button>
    </form>
  )
}

function Receipt({
  orders,
  total,
  campaignId,
  remainingCents,
}: {
  orders: Order[]
  total: number
  campaignId: string
  remainingCents?: number
}) {
  return (
    <div className="flex flex-col items-center gap-8 py-6 text-center">
      <motion.span
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={spring}
        className="relative inline-flex size-20 items-center justify-center rounded-full bg-success text-success-foreground"
      >
        <span className="animate-ring absolute inset-0 rounded-full border-2 border-success" />
        <motion.span
          initial={{ scale: 0, rotate: -90 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: 0.15, ...spring }}
        >
          <Check className="size-9" strokeWidth={2.5} />
        </motion.span>
      </motion.span>
      <div>
        <h1 className="font-serif text-4xl tracking-tight sm:text-5xl">
          Payment verified
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          PayPal sandbox · Fulfillment simulated · No goods ordered
        </p>
        {orders.some((order) => order.mock) && (
          <p className="mt-2 text-sm text-muted-foreground">
            Mock product data · PayPal sandbox transaction · no goods ordered
          </p>
        )}
        <p className="mt-2 text-muted-foreground tabular">
          {usd(total)} · {orders.length}{' '}
          {orders.length === 1 ? 'order' : 'orders'} via PayPal
        </p>
      </div>
      <Card className="w-full max-w-lg overflow-hidden text-left">
        <dl className="grid grid-cols-2 gap-4 border-b border-border p-5 text-sm">
          <div>
            <dt className="text-muted-foreground">Approved amount</dt>
            <dd className="mt-1 font-medium tabular">
              {usd(
                orders.reduce(
                  (sum, order) =>
                    sum +
                    (order.approvedTotalCents ??
                      order.totalCents ??
                      Math.round(order.total * 100)),
                  0,
                ) / 100,
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Verified capture</dt>
            <dd className="mt-1 font-medium tabular">
              {usd(total)} · COMPLETED
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">
              Budget used by this purchase
            </dt>
            <dd className="mt-1 font-medium tabular">{usd(total)}</dd>
          </div>
          {remainingCents !== undefined && (
            <div>
              <dt className="text-muted-foreground">
                Campaign budget remaining
              </dt>
              <dd className="mt-1 font-medium tabular">
                {usd(remainingCents / 100)}
              </dd>
            </div>
          )}
        </dl>
        <ul>
          {orders.map((o, i) => (
            <motion.li
              key={o.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{
                opacity: 1,
                y: 0,
                transition: { delay: 0.25 + i * 0.07 },
              }}
              className="flex items-center justify-between gap-4 border-b border-border px-5 py-3.5 last:border-0"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{o.supplier}</p>
                <p className="break-all font-mono text-xs text-muted-foreground">
                  Order: {o.id}
                  <br />
                  Capture: {o.paypalTxn}
                </p>
              </div>
              <span className="text-sm tabular">{usd(o.total)}</span>
            </motion.li>
          ))}
        </ul>
      </Card>
      <PressableLink href={`/campaigns/${campaignId}`} size="lg">
        Campaign Dashboard <ArrowRight />
      </PressableLink>
    </div>
  )
}
