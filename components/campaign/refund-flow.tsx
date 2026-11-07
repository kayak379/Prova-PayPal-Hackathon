'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, ArrowRight, Check, CheckCircle2, LoaderCircle, ReceiptText, RotateCcw, Store } from 'lucide-react'
import type { Campaign, FinanceAction, PurchaseRefund } from '@/lib/types'
import { refundBalances } from '@/lib/refund-allocation'
import { usdPrecise } from '@/lib/format'
import { useStore } from '@/lib/store'
import { Modal } from '../modal'
import { Pressable, inputClass, Label } from '../kit'

const dollars = (cents: number) => usdPrecise(cents / 100)

export function RefundFlow({ campaign, orderId }: { campaign: Campaign; orderId: string }) {
  const { flush, refresh, saveFinanceDraft } = useStore()
  const [open, setOpen] = useState(false)
  const [selection, setSelection] = useState<string[]>(['all'])
  const [reason, setReason] = useState('')
  const [prepared, setPrepared] = useState<FinanceAction | null>(null)
  const [result, setResult] = useState<PurchaseRefund | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const latest = useRef(campaign)
  latest.current = campaign
  const reduced = useReducedMotion()
  const id = useId()
  const order = campaign.orders.find(o => o.id === orderId)
  const balances = order ? refundBalances(order, campaign.refunds || []) : []
  const reserved = (campaign.refunds || []).filter(r => r.orderId === orderId && !['FAILED', 'CANCELLED', 'CANCELED'].includes(r.status)).reduce((sum, r) => sum + r.amountCents, 0)
  const remaining = Math.max(0, (order?.totalCents ?? Math.round((order?.total || 0) * 100)) - reserved)
  const entirePurchase = selection.includes('all')
  const selectedAmount = entirePurchase ? remaining : balances.filter(b => selection.includes(b.retailer)).reduce((sum, b) => sum + b.amountCents, 0)
  const pending = (campaign.financeOperations || []).filter(op => op.status === 'pending' && op.action.kind === 'refund' && op.action.orderId === orderId)
  const stage = result ? 'done' : prepared ? 'review' : 'choose'

  useEffect(() => {
    if (!open) return
    const dialog = content.current?.closest('[role="dialog"]') as HTMLElement | null
    if (!dialog) return
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusable = () => [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex="0"]')]
    focusable()[0]?.focus()
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const elements = focusable()
      const first = elements[0], last = elements.at(-1)
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
    }
    dialog.addEventListener('keydown', trap)
    return () => { document.body.style.overflow = originalOverflow; dialog.removeEventListener('keydown', trap); trigger.current?.focus() }
  }, [open])

  async function api(action: string, extra: object) {
    await flush()
    const response = await fetch('/api/finance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, campaign: { id: campaign.id }, ...extra }) })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Could not complete the refund. Please try again.')
    await refresh()
    return data
  }
  async function work(fn: () => Promise<void>) {
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try { await fn() } catch (e) { setError(e instanceof Error ? e.message : 'Refund unavailable.') }
    finally { lock.current = false; setBusy(false) }
  }
  async function confirm() {
    if (!prepared) return
    // Persist the exact signed intent before submission so an uncertain response
    // can only retry the same refund, including after navigating away.
    const operations = latest.current.financeOperations || []
    await saveFinanceDraft(campaign.id, { financeOperations: [...operations.filter(op => op.id !== prepared.operationId), { id: prepared.operationId, action: prepared, status: 'pending' }] })
    const data = await api('confirm', { token: prepared.token })
    await saveFinanceDraft(campaign.id, { financeOperations: (latest.current.financeOperations || []).map(op => op.id === prepared.operationId ? { ...op, status: 'completed' as const, resultId: data.refund.id } : op) })
    setResult(data.refund)
    await refresh()
  }
  function toggleSupplier(retailer: string) {
    setSelection(current => {
      if (retailer === 'all') return current.includes('all') ? [] : ['all']
      if (current.includes(retailer)) return current.filter(value => value !== retailer)
      return [...current.filter(value => value !== 'all'), retailer]
    })
  }

  function launch(action?: FinanceAction) {
    setSelection(['all']); setReason(''); setPrepared(action || null); setResult(null); setError(''); setOpen(true)
  }
  if (!order) return null
  return <div className="space-y-3">
    <button ref={trigger} onClick={() => launch()} disabled={remaining <= 0 || pending.length > 0} className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-sm font-medium transition-colors hover:border-brand/40 hover:bg-brand-soft/40 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50">
      <RotateCcw className="size-4 text-brand" />{remaining > 0 ? 'Request a refund' : 'No refundable balance'}
    </button>
    {pending.map(op => <button key={op.id} onClick={() => launch(op.action)} className="block text-sm text-brand underline underline-offset-4">Resume refund · {dollars(op.action.amountCents)}</button>)}
    {(campaign.refunds || []).filter(r => r.orderId === orderId).map(r => <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <span>{r.allocations?.length === 1 ? r.allocations[0].retailer : r.allocations?.length ? `${r.allocations.length} suppliers` : 'Purchase refund'} · {dollars(r.amountCents)}</span>
      <button onClick={() => { launch(); setResult(r) }} className="rounded-md px-2 py-1 transition-colors hover:bg-muted">View refund <ArrowRight className="ml-1 inline size-3" /></button>
    </div>)}
    <Modal open={open} onClose={() => { if (!lock.current) setOpen(false) }} title={result ? 'Your refund' : 'Request a refund'} dismissable={!busy} className="max-w-lg">
      <div ref={content} tabIndex={-1} className="outline-none">
        <div className="mb-6 flex items-center justify-center gap-4" aria-label={result ? 'Refund submitted' : prepared ? 'Step 2 of 2: Review' : 'Step 1 of 2: Choose suppliers'}>
          {['Choose', 'Review'].map((label, i) => <div key={label} className="contents"><div className="flex items-center gap-2 text-xs"><span className={`flex size-6 items-center justify-center rounded-full transition-colors ${result || i === (prepared ? 1 : 0) ? 'bg-brand text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{result ? <Check className="size-3" /> : i + 1}</span><span className="text-muted-foreground">{label}</span></div>{i === 0 && <span className="h-px w-12 bg-border sm:w-20" />}</div>)}
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={stage} initial={{ opacity: 0, x: reduced ? 0 : 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reduced ? 0 : -12 }} transition={{ duration: reduced ? 0 : 0.18 }}>
            {result ? <div className="space-y-5 text-center">
              <motion.div initial={{ scale: reduced ? 1 : 0.6 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 240, damping: 16 }} className="mx-auto flex size-16 items-center justify-center rounded-full bg-brand-soft text-brand"><CheckCircle2 className="size-8" /></motion.div>
              <div><h3 className="font-serif text-3xl">{result.status === 'COMPLETED' ? 'Refund complete' : ['FAILED', 'CANCELLED', 'CANCELED'].includes(result.status) ? 'Refund not completed' : 'Refund submitted'}</h3><p className="mt-2 text-3xl tabular">{dollars(result.amountCents)}</p><p className="mt-2 text-sm text-muted-foreground">{result.allocations?.length === 1 ? result.allocations[0].retailer : result.allocations?.length ? `${result.allocations.length} suppliers` : 'Purchase refund'} · {result.status.toLowerCase().replaceAll('_', ' ')}</p></div>
              <p className="text-sm text-muted-foreground">{result.status === 'COMPLETED' ? 'Returned to the original buyer. Your campaign budget has been updated.' : 'Your campaign budget updates when PayPal confirms completion.'}</p>
              {result.status !== 'COMPLETED' && <Pressable disabled={busy} onClick={() => work(async () => { const data = await api('refund', { id: result.id }); setResult(data.refund); await refresh() })}>Refresh status</Pressable>}
              <button onClick={() => setOpen(false)} disabled={busy} className="block w-full rounded-full border border-border px-4 py-3 text-sm transition-colors hover:bg-muted">Done</button>
            </div> : prepared ? <div className="space-y-5">
              <div className="rounded-2xl border border-brand/20 bg-brand-soft/30 p-5"><p className="text-xs text-muted-foreground">Refund to original buyer</p><p className="mt-2 font-serif text-4xl tabular">{dollars(prepared.amountCents)}</p><p className="mt-2 text-sm">{prepared.title === 'Refund entire purchase' ? 'Entire purchase' : prepared.allocations?.length === 1 ? prepared.allocations[0].retailer : `${prepared.allocations?.length || 0} selected suppliers`}</p></div>
              <div className="space-y-2">{prepared.allocations?.map(share => <div key={share.retailer} className="flex justify-between gap-3 text-sm"><span className="truncate">{share.retailer}</span><span className="tabular">{dollars(share.amountCents)}</span></div>)}</div>
              <p className="text-xs leading-relaxed text-muted-foreground">Only the listed suppliers’ refundable balances are reduced. Budget is restored after PayPal confirms completion. Already-sent retailer payouts are separate and are not recovered by this refund.</p>
              <div className="flex items-center justify-between gap-3"><button disabled={busy || pending.some(op => op.id === prepared.operationId)} onClick={() => { setPrepared(null); setError('') }} className="inline-flex items-center gap-1 rounded-full px-3 py-2 text-sm hover:bg-muted disabled:opacity-40"><ArrowLeft className="size-4" />Back</button><Pressable disabled={busy} onClick={() => work(confirm)}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : <RotateCcw className="size-4" />} {pending.some(op => op.id === prepared.operationId) ? 'Retry same refund' : 'Confirm refund'}</Pressable></div>
            </div> : <div className="space-y-5">
              <p className="text-sm text-muted-foreground">Choose one or more suppliers, or refund the entire purchase.</p>
              <fieldset className="space-y-2"><legend className="sr-only">What would you like to refund?</legend>
                {[{ retailer: 'all', amountCents: remaining }, ...balances].map(option => {
                  const chosen = selection.includes(option.retailer)
                  return <motion.label key={option.retailer} whileTap={reduced ? undefined : { scale: 0.99 }} className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 transition-colors focus-within:ring-2 focus-within:ring-ring ${chosen ? 'border-brand/60 bg-brand-soft/40' : 'border-border hover:bg-muted/40'} ${!option.amountCents ? 'cursor-not-allowed opacity-45' : ''}`}>
                    <input type="checkbox" name={id} value={option.retailer} checked={chosen} disabled={!option.amountCents || busy} onChange={() => toggleSupplier(option.retailer)} className="sr-only" />
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-brand">{option.retailer === 'all' ? <ReceiptText className="size-4" /> : <Store className="size-4" />}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{option.retailer === 'all' ? 'Entire purchase' : option.retailer}</span><span className="text-xs text-muted-foreground">{option.amountCents ? option.retailer === 'all' ? 'All remaining refundable funds' : 'Includes shipping & tax' : 'No refundable funds'}</span></span>
                    <span className="text-sm tabular">{dollars(option.amountCents)}</span><span className={`flex size-4 shrink-0 items-center justify-center rounded border ${chosen ? 'border-brand bg-brand text-primary-foreground' : 'border-border'}`}>{chosen && <Check className="size-3" />}</span>
                  </motion.label>
                })}
              </fieldset>
              <div><Label htmlFor={`${id}-reason`}>Reason <span className="font-normal text-muted-foreground">(optional)</span></Label><input id={`${id}-reason`} className={inputClass} maxLength={200} placeholder="Tell us what happened" value={reason} disabled={busy} onChange={e => setReason(e.target.value)} /></div>
              <Pressable className="w-full justify-center" disabled={busy || selectedAmount <= 0} onClick={() => work(async () => { const data = await api('prepare', { input: { kind: 'refund', orderId, refundScope: entirePurchase ? 'all' : 'suppliers', suppliers: selection, full: true, reason } }); setPrepared(data.prepared) })}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : <>Review {dollars(selectedAmount)} <ArrowRight className="size-4" /></>}</Pressable>
            </div>}
          </motion.div>
        </AnimatePresence>
        {busy && <p role="status" className="mt-4 text-center text-xs text-muted-foreground">Checking your refund with PayPal…</p>}
        {error && <p role="alert" className="mt-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      </div>
    </Modal>
  </div>
}
