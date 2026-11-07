'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, LoaderCircle, RotateCcw } from 'lucide-react'
import type { Campaign, FinanceAction, Order, PayoutSummary } from '@/lib/types'
import { useStore } from '@/lib/store'
import { usdPrecise } from '@/lib/format'
import { Modal } from '../modal'
import { inputClass, Label, Pressable } from '../kit'

const dollars = (cents: number) => usdPrecise(cents / 100)
const reserved = (status: string) => !['FAILED', 'CANCELLED', 'CANCELED'].includes(status)

export function ReturnDialog({ campaign, order }: { campaign: Campaign; order: Order }) {
  const [open, setOpen] = useState(false)
  return <>
    <Pressable variant="ghost" size="sm" onClick={() => setOpen(true)}><RotateCcw className="size-3.5" /> Return</Pressable>
    {open && <ReturnForm campaign={campaign} order={order} onClose={() => setOpen(false)} />}
  </>
}

function ReturnForm({ campaign, order, onClose }: { campaign: Campaign; order: Order; onClose: () => void }) {
  const { refresh, flush, saveFinanceDraft } = useStore()
  const [retailer, setRetailer] = useState('')
  const refunds = (campaign.refunds || []).filter(r => r.orderId === order.id && reserved(r.status))
  const remaining = Math.max(0, (order.totalCents ?? Math.round(order.total * 100)) - refunds.reduce((sum, r) => sum + r.amountCents, 0))
  const [mode, setMode] = useState<'buyer' | 'retailers'>(remaining === 0 && order.payouts ? 'retailers' : 'buyer')
  const [amount, setAmount] = useState((remaining / 100).toFixed(2))
  const [selected, setSelected] = useState<string[]>([])
  const [review, setReview] = useState<FinanceAction | null>(() => campaign.financeOperations?.find(op => op.status === 'pending' && op.action.kind === 'refund' && op.action.orderId === order.id && !campaign.refunds?.some(refund => refund.operationId === op.id))?.action || null)
  const [recovery, setRecovery] = useState<{ payouts: PayoutSummary; token: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const content = useRef<HTMLDivElement>(null)
  const payouts = recovery?.payouts || order.payouts
  const unsent = !!payouts && !payouts.batchId && !payouts.recoveryRequested
  const canSelect = payouts?.items.some(item => item.status === 'UNCLAIMED')

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    content.current?.focus()
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const elements = content.current?.closest('[role="dialog"]')?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')
      const first = elements?.[0], last = elements?.[elements.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', trap)
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', trap); previous?.focus() }
  }, [])

  async function post(url: string, body: object) {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Unable to complete return.')
    return result
  }
  async function run(work: () => Promise<void>) {
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try { await flush(); await work() }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to complete return.') }
    finally { lock.current = false; setBusy(false) }
  }
  async function prepareRefund() {
    const result = await post('/api/finance', { action: 'prepare', campaign: { id: campaign.id }, input: { kind: 'refund', orderId: order.id, retailer: retailer || undefined, amountCents: Math.round(Number(amount) * 100) } })
    setReview(result.prepared)
  }
  async function confirmRefund() {
    if (!review) return
    const operations = [...(campaign.financeOperations || []).filter(op => op.id !== review.operationId), { id: review.operationId, action: review, status: 'pending' as const }]
    await saveFinanceDraft(campaign.id, { financeOperations: operations })
    const result = await post('/api/finance', { action: 'confirm', campaign: { id: campaign.id }, token: review.token })
    setReview(null)
    setDone(result.refund.status === 'COMPLETED' ? `${dollars(result.refund.amountCents)} refunded` : 'Refund submitted')
    await saveFinanceDraft(campaign.id, { financeOperations: operations.map(op => op.id === review.operationId ? { ...op, status: 'completed' as const, resultId: result.refund.id } : op) })
    await refresh()
  }
  async function recover(action: 'prepare' | 'confirm' | 'refresh') {
    const result = await post('/api/checkout/recovery', { action, campaignId: campaign.id, orderId: order.id, itemIds: unsent ? undefined : selected.length ? selected : undefined, token: recovery?.token })
    setRecovery(action === 'prepare' ? result : null)
    if (action === 'confirm') {
      if (result.payouts.error) setError(result.payouts.error)
      else if (result.payouts.items.some((item: { error?: string }) => item.error)) setError('Recovery needs attention. Check retailer status.')
      else if (result.payouts.status === 'STOPPED') setDone('Payouts stopped')
      else if (result.payouts.items.some((item: { senderItemId: string; status: string }) => selected.includes(item.senderItemId) && ['RETURNED', 'REFUNDED'].includes(item.status))) setDone('Payouts cancelled')
      else setError('No payouts could be cancelled. Check retailer status.')
    }
    await refresh()
  }
  const reviewing = !!review || !!recovery
  return <Modal open onClose={onClose} dismissable={!busy} title={done ? 'Return status' : reviewing ? 'Confirm return' : 'Return payment'}>
    <div ref={content} tabIndex={-1} className="flex flex-col gap-5 outline-none">
      {done ? <div className="flex flex-col items-center gap-4 py-5 text-center"><Check className="size-9 text-brand" /><p className="font-serif text-2xl">{done}</p><Pressable onClick={onClose} className="w-full">Done</Pressable></div> : <>
        {!reviewing && order.payouts && <div className="grid grid-cols-2 gap-1 rounded-full bg-muted p-1" role="group" aria-label="Return type">
          {(['buyer', 'retailers'] as const).map(value => <button key={value} disabled={busy} aria-pressed={mode === value} onClick={() => { setMode(value); setError('') }} className={`rounded-full px-3 py-2 text-sm font-medium transition-colors ${mode === value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{value === 'buyer' ? 'Buyer refund' : 'Retailer recovery'}</button>)}
        </div>}
        {review ? <><div className="py-4 text-center"><p className="text-4xl font-medium tracking-tight tabular">{dollars(review.amountCents)}</p><p className="mt-2 text-sm text-muted-foreground">To original buyer{review.retailer ? ` · ${review.retailer}` : ''}</p></div><div className="flex gap-2"><Pressable variant="ghost" disabled={busy} onClick={() => setReview(null)}>Edit</Pressable><Pressable className="flex-1" disabled={busy} onClick={() => run(confirmRefund)}>Confirm refund</Pressable></div></>
        : recovery ? <><p className="text-sm">{unsent ? 'Stop all pending retailer payouts?' : 'Cancel selected unclaimed payouts?'}</p><ul className="divide-y divide-border text-sm">{recovery.payouts.items.filter(item => unsent || selected.includes(item.senderItemId)).map(item => <li key={item.senderItemId} className="flex justify-between gap-3 py-3"><span>{item.retailer}</span><span className="tabular">{dollars(item.amountCents)}</span></li>)}</ul><div className="flex gap-2"><Pressable variant="ghost" disabled={busy} onClick={() => setRecovery(null)}>Edit</Pressable><Pressable className="flex-1" disabled={busy} onClick={() => run(() => recover('confirm'))}>{unsent ? 'Stop payouts' : 'Confirm cancellation'}</Pressable></div></>
        : mode === 'buyer' ? <>
          {!!order.payouts && <div><Label htmlFor={`return-retailer-${order.id}`}>Portion</Label><select id={`return-retailer-${order.id}`} className={inputClass} value={retailer} disabled={busy} onChange={e => { const domain = e.target.value; setRetailer(domain); const portion = order.payouts?.items.find(item => item.retailer === domain); const used = refunds.filter(r => r.retailer === domain).reduce((sum, r) => sum + r.amountCents, 0); setAmount((Math.max(0, portion ? Math.min(remaining, portion.amountCents - used) : remaining) / 100).toFixed(2)); setError('') }}><option value="">Whole purchase</option>{order.payouts.items.map(item => <option key={item.senderItemId} value={item.retailer}>{item.retailer}</option>)}</select></div>}
          <div><Label htmlFor={`return-amount-${order.id}`}>Amount · USD</Label><input id={`return-amount-${order.id}`} className={`${inputClass} tabular`} type="number" min="0.01" step="0.01" value={amount} disabled={busy} onChange={e => setAmount(e.target.value)} /></div>
          <Pressable className="w-full" disabled={busy || !Number.isFinite(Number(amount)) || Number(amount) <= 0} onClick={() => run(prepareRefund)}>Review refund</Pressable>
        </> : <>
          <ul className="max-h-64 divide-y divide-border overflow-y-auto">{payouts?.items.map(item => { const eligible = item.status === 'UNCLAIMED' && !!item.payoutItemId; const label = ['RETURNED', 'REFUNDED'].includes(item.status) ? 'Returned' : item.status === 'SUCCESS' ? 'Recipient return required' : item.status.toLowerCase().replaceAll('_', ' '); return <li key={item.senderItemId} className="py-3"><label className="flex items-center gap-3">{eligible && !unsent && <input type="checkbox" className="accent-brand" disabled={busy} checked={selected.includes(item.senderItemId)} onChange={e => setSelected(e.target.checked ? [...selected, item.senderItemId] : selected.filter(id => id !== item.senderItemId))} />}<span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{item.retailer}</span><span className="text-xs text-muted-foreground">{label}</span></span><span className="text-sm tabular">{dollars(item.amountCents)}</span></label>{item.error && <p className="mt-1 text-xs text-destructive">{item.error}</p>}</li> })}</ul>
          <div className="flex gap-2"><Pressable variant="ghost" disabled={busy} onClick={() => run(() => recover('refresh'))}>Check status</Pressable>{(unsent || canSelect) && <Pressable className="flex-1" disabled={busy || (!unsent && !selected.length)} onClick={() => run(() => recover('prepare'))}>{unsent ? 'Review stop' : 'Review cancellation'}</Pressable>}</div>
        </>}
      </>}
      {busy && <span role="status" className="flex items-center justify-center gap-2 text-xs text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin" /> Processing…</span>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  </Modal>
}
