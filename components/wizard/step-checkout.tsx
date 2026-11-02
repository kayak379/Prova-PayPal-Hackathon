'use client'

import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, ArrowRight, Check, Loader2, Lock, MapPin, ShieldCheck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Card, inputClass, Pressable, PressableLink } from '../kit'
import { Modal } from '../modal'
import { PayPalWordmark } from '../brand'
import { spring } from '../motion-provider'
import { planTotals, usd } from '@/lib/format'
import { useStore } from '@/lib/store'
import type { Order, Plan } from '@/lib/types'
import { cn } from '@/lib/utils'
import type { Draft } from './campaign-wizard'

import { paypalSDK } from '@/lib/paypal-client'
import { estimatedPlan, totalsCents } from '@/lib/money'
const PHRASE = 'I approve'
type Pending = { orderId: string; ticket: string; approvalUrl: string }
async function post(url: string, input: unknown) {
 const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
 const data = await res.json(); if (!res.ok || data.error) throw new Error(data.error || 'Payment request failed'); return data
}
export function StepCheckout({ plan, draft, existingId, onPayingChange, onPaymentComplete, onBack }: {
 plan: Plan; draft: Draft; existingId?: string; prompt: string; onPayingChange: (b: boolean) => void; onPaymentComplete: (b: boolean) => void; onBack: () => void
}) {
 const { settings, addOrders, saveProposal, campaigns } = useStore()
 const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [receipt, setReceipt] = useState<Order | null>(null)
 const [pending, setPending] = useState<Pending | null>(null); const started = useRef(false)
 const [savedEmail, setSavedEmail] = useState('')
 const [approveOpen, setApproveOpen] = useState(false)
 const key = 'prova-payment-' + existingId
 const totals = totalsCents(plan.items)
 const groups = [...new Set(plan.items.map(p => p.supplier))]
 useEffect(() => { void paypalSDK().catch(() => {}); fetch('/api/paypal/vault').then(r => r.json()).then(wallet => setSavedEmail(wallet.saved ? wallet.email : '')).catch(() => {}) }, [])
 const callbacks = useRef({ onPayingChange, onPaymentComplete }); callbacks.current = { onPayingChange, onPaymentComplete }
 async function capture(payment: Pending) {
  setBusy(true); setError(''); callbacks.current.onPayingChange(true)
  try {
   const result = await post('/api/checkout/capture', payment)
   if (result.campaignId !== existingId) throw new Error('Payment belongs to another campaign.')
   addOrders(result.campaignId, [result.receipt], [{ at: Date.now(), actor: 'user', message: 'Approved proposal through PayPal sandbox' }, { at: Date.now(), actor: 'paypal', message: `Sandbox payment captured · ${result.receipt.paypalTxn} · fulfillment simulated` }])
   saveProposal(result.campaignId, campaigns.find(c => c.id === existingId)?.request || '', null)
   localStorage.removeItem('prova-attempt-' + existingId); localStorage.removeItem(key); setPending(null); setReceipt(result.receipt); callbacks.current.onPaymentComplete(true)
   window.history.replaceState(null, '', `/campaigns/new?campaign=${existingId}`)
  } catch (e) { setError(e instanceof Error ? e.message : 'Payment verification failed') }
  finally { setBusy(false); callbacks.current.onPayingChange(false) }
 }
 useEffect(() => {
  if (started.current) return; started.current = true
  try {
   const raw = localStorage.getItem(key); if (!raw) return
   const payment: Pending = JSON.parse(raw); setPending(payment)
   const params = new URLSearchParams(window.location.search)
   if (params.get('payment') === 'cancelled') { localStorage.removeItem(key); setPending(null); setError('PayPal approval was cancelled. You have not been marked paid. You can start checkout again.'); return }
   if (params.get('payment') === 'approved' && params.get('token') !== payment.orderId) { setError('PayPal returned a different order. Please retry verification.'); return }
   void capture(payment)
  } catch { setError('Could not restore pending checkout.') }
 }, [])
 async function approvePayment(payment: Pending) {
  const sdk = await paypalSDK()
  const eligible = await sdk.findEligibleMethods({ currencyCode: 'USD' })
  if (!eligible.isEligible('paypal')) throw new Error('PayPal is unavailable in this browser.')
  const session = sdk.createPayPalOneTimePaymentSession({
   onApprove: async ({ orderId }) => { if (orderId !== payment.orderId) throw new Error('Payment order mismatch.'); await capture(payment) },
   onCancel: () => { localStorage.removeItem(key); setPending(null); setBusy(false); onPayingChange(false); setError('PayPal approval was cancelled. You can retry.') },
   onError: () => { setBusy(false); onPayingChange(false); setError('PayPal approval failed. Please resume or verify your payment.') }
  })
  await session.start({ presentationMode: 'modal' }, Promise.resolve({ orderId: payment.orderId }))
 }
 async function resumePayment() {
  if (!pending) return
  setBusy(true); setError(''); onPayingChange(true)
  try { await approvePayment(pending) } catch (e) { setBusy(false); onPayingChange(false); setError(e instanceof Error ? e.message : 'PayPal approval failed') }
 }
 async function pay() {
  setBusy(true); setError(''); onPayingChange(true)
  try {
   if (!existingId) throw new Error('Save the campaign before checkout.')
   const attemptKey = 'prova-attempt-' + existingId
   const attemptId = localStorage.getItem(attemptKey) || crypto.randomUUID()
   localStorage.setItem(attemptKey, attemptId)
   const result = await post('/api/checkout/create', { attemptId, campaignId: existingId, snapshot: plan.snapshot, items: plan.items.map(p => ({ id: p.id, qty: p.qty })) })
   const payment: Pending = { orderId: result.orderId, ticket: result.ticket, approvalUrl: result.approvalUrl }
   // Persist the approved cart before leaving this page.
   const raw = localStorage.getItem('prova-workspace-v1')
   if (!raw) throw new Error('Workspace could not be saved. Enable browser storage before payment.')
   const workspace = JSON.parse(raw)
   workspace.campaigns = workspace.campaigns.map((c: any) => c.id === existingId ? { ...c, proposal: estimatedPlan(plan) } : c)
   localStorage.setItem('prova-workspace-v1', JSON.stringify(workspace))
   localStorage.setItem(key, JSON.stringify(payment)); setPending(payment)
   if (result.requiresApproval === false) await capture(payment)
   else await approvePayment(payment)
  } catch (e) { setError(e instanceof Error ? e.message : 'Checkout failed'); setBusy(false); onPayingChange(false) }
 }
 const phase = receipt ? 'done' : busy ? 'processing' : 'ready'
 const suppliers = groups
 const total = totals.total / 100
 const progress = 0
 const orders: Order[] = receipt ? [receipt] : groups.map(supplier => ({ id: supplier, supplier, items: plan.items.filter(p => p.supplier === supplier), paypalTxn: 'Awaiting PayPal', total: plan.items.filter(p => p.supplier === supplier).reduce((sum, p) => sum + p.unitPrice * p.qty, 0), status: 'processing', createdAt: Date.now() }))
 const authorize = () => { setApproveOpen(false); void pay() }
 if (receipt && existingId) return <Receipt orders={[receipt]} total={receipt.total} campaignId={existingId} />
  return (
    <div className="flex flex-col gap-6">
      {plan.mock && <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><p className="font-semibold">Mock data — sandbox checkout</p><p>Products and prices are sample data. PayPal will process a real sandbox test transaction; no goods will be ordered.</p></div>}
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {pending && !busy && <div className="flex gap-3"><Pressable size="sm" onClick={() => capture(pending)}>Verify payment</Pressable><button type="button" className="text-sm underline" onClick={resumePayment}>Resume PayPal approval</button></div>}
      <h1 className="font-serif text-4xl tracking-tight sm:text-5xl">{phase === 'processing' ? 'Placing orders' : 'Checkout'}</h1>

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <Card className="overflow-hidden">
          <ul>
            {(phase === 'processing' ? orders.map((o) => o.supplier) : suppliers).map((s, i) => {
              const items = plan.items.filter((it) => it.supplier === s)
              const sub = phase === 'processing' ? orders[i].total : items.reduce((a, it) => a + it.qty * it.unitPrice, 0)
              const stage = phase === 'processing' ? Math.max(0, Math.min(3, progress - i * 3)) : -1
              return (
                <li key={s} className="flex items-center gap-4 border-b border-border px-5 py-4 last:border-0">
                  <SupplierStatus stage={stage} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{s}</p>
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.p
                        key={stage}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        className="truncate text-xs text-muted-foreground"
                      >
                        {stage === -1 && items.map((it) => `${it.qty.toLocaleString()} × ${it.name}`).join(', ')}
                        {stage === 0 && 'Queued'}
                        {stage === 1 && 'Creating purchase order…'}
                        {stage === 2 && 'Authorizing with PayPal…'}
                        {stage === 3 && <span className="font-mono">{orders[i].paypalTxn}</span>}
                      </motion.p>
                    </AnimatePresence>
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
                <p className="truncate text-sm font-medium">{savedEmail || settings.orgName}</p>
                <p className="text-xs text-muted-foreground">{savedEmail ? 'Saved PayPal · Sandbox' : 'PayPal · Sandbox'}</p>
              </div>
            </div>
            <p className="mt-5 text-xs text-muted-foreground">You pay</p>
            <p className="text-3xl font-medium tracking-tight tabular">{usd(total)}</p>
            <p className="text-xs text-muted-foreground">
              1 sandbox payment · fulfillment simulated
            </p>

            {phase === 'processing' ? (
              <div className="mt-5">
                <div className="h-11 overflow-hidden rounded-full bg-muted">
                  <motion.div
                    className="flex h-full origin-left items-center rounded-full bg-paypal-blue"
                    animate={{ scaleX: Math.max(0.06, progress / (orders.length * 3)) }}
                    transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                  />
                </div>
                <p className="mt-2 text-center text-xs text-muted-foreground tabular">
                  {Math.min(orders.length, Math.floor(progress / 3))} of {orders.length} confirmed
                </p>
              </div>
            ) : (
              <>
                <motion.button
                  layoutId="paypal-approve"
                  disabled={!!pending || !plan.snapshot}
                  onClick={() => setApproveOpen(true)}
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.97 }}
                  style={{ borderRadius: 999 }}
                  className="mt-5 flex h-12 w-full items-center justify-center gap-1.5 bg-paypal-gold text-[15px] font-semibold text-paypal-navy outline-none focus-visible:ring-2 focus-visible:ring-paypal-blue focus-visible:ring-offset-2"
                >
                  Pay with <span className="font-extrabold italic">PayPal</span>
                </motion.button>
                <Pressable variant="ghost" size="sm" className="mt-2 w-full" onClick={onBack}>
                  <ArrowLeft /> Back to proposal
                </Pressable>
              </>
            )}
          </div>
        </aside>
      </div>

      <Modal open={approveOpen} onClose={() => setApproveOpen(false)} layoutId="paypal-approve" title="Authorize payment">
        <ApproveForm total={total} count={suppliers.length} onApprove={authorize} />
      </Modal>
    </div>
  )
}

function SupplierStatus({ stage }: { stage: number }) {
  return (
    <span
      className={cn(
        'inline-flex size-9 shrink-0 items-center justify-center rounded-full border transition-colors duration-300',
        stage === 3 ? 'border-success bg-success text-white' : stage > 0 ? 'border-paypal-blue text-paypal-blue' : 'border-border text-muted-foreground',
      )}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {stage === 3 ? (
          <motion.span key="c" initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} transition={spring}>
            <Check className="size-4" strokeWidth={3} />
          </motion.span>
        ) : stage > 0 ? (
          <motion.span key="l" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
            <Loader2 className="size-4 animate-spin" />
          </motion.span>
        ) : (
          <motion.span key="d" exit={{ scale: 0 }} className="size-1.5 rounded-full bg-current" />
        )}
      </AnimatePresence>
    </span>
  )
}

function ApproveForm({ total, count, onApprove }: { total: number; count: number; onApprove: () => void }) {
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
        Prova will place {count} {count === 1 ? 'order' : 'orders'} totaling{' '}
        <span className="font-medium text-foreground tabular">{usd(total)}</span> through your PayPal Business account.
      </p>
      <div>
        <label htmlFor="approve" className="mb-2 block text-[13px] font-medium text-muted-foreground">
          Type <span className="font-semibold text-foreground">{PHRASE}</span> to confirm
        </label>
        <div className="relative">
          <input
            id="approve"
            autoFocus
            autoComplete="off"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={PHRASE}
            className={cn(inputClass, 'pr-11', match && 'border-success focus:border-success focus:shadow-[0_0_0_4px_var(--success-soft)]')}
          />
          <AnimatePresence>
            {match && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                transition={spring}
                className="absolute right-3 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-full bg-success text-white"
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

function Receipt({ orders, total, campaignId }: { orders: Order[]; total: number; campaignId: string }) {
  return (
    <div className="flex flex-col items-center gap-8 py-6 text-center">
      <motion.span
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={spring}
        className="relative inline-flex size-20 items-center justify-center rounded-full bg-success text-white"
      >
        <span className="animate-ring absolute inset-0 rounded-full border-2 border-success" />
        <motion.span initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} transition={{ delay: 0.15, ...spring }}>
          <Check className="size-9" strokeWidth={2.5} />
        </motion.span>
      </motion.span>
      <div>
        <h1 className="font-serif text-4xl tracking-tight sm:text-5xl">Payment complete</h1>
        {orders.some(order => order.mock) && <p className="mt-2 text-sm text-muted-foreground">Mock product data · PayPal sandbox transaction · no goods ordered</p>}
        <p className="mt-2 text-muted-foreground tabular">
          {usd(total)} · {orders.length} {orders.length === 1 ? 'order' : 'orders'} via PayPal
        </p>
      </div>
      <Card className="w-full max-w-lg overflow-hidden text-left">
        <ul>
          {orders.map((o, i) => (
            <motion.li
              key={o.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0, transition: { delay: 0.25 + i * 0.07 } }}
              className="flex items-center justify-between gap-4 border-b border-border px-5 py-3.5 last:border-0"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{o.supplier}</p>
                <p className="truncate font-mono text-xs text-muted-foreground">
                  {o.id} · {o.paypalTxn}
                </p>
              </div>
              <span className="text-sm tabular">{usd(o.total)}</span>
            </motion.li>
          ))}
        </ul>
      </Card>
      <PressableLink href={`/campaigns/${campaignId}`} size="lg">
        View campaign <ArrowRight />
      </PressableLink>
    </div>
  )
}
