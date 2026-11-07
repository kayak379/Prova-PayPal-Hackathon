'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, LoaderCircle, Package } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Select } from '@base-ui/react/select'
import type { Campaign, FinanceAction, Order } from '@/lib/types'
import { useStore } from '@/lib/store'
import { usdPrecise } from '@/lib/format'
import { Modal } from '../modal'
import { inputClass, Label, Pressable } from '../kit'

const dollars = (cents: number) => usdPrecise(cents / 100)
const reserved = (status: string) => !['FAILED', 'CANCELLED', 'CANCELED'].includes(status)

export function ReturnDialog({ campaign, order }: { campaign: Campaign; order: Order }) {
  const [open, setOpen] = useState(false)
  return <>
    <Pressable variant="secondary" onClick={() => setOpen(true)}>Return</Pressable>
    {open && <ReturnForm campaign={campaign} order={order} onClose={() => setOpen(false)} />}
  </>
}

function ReturnForm({ campaign, order, onClose }: { campaign: Campaign; order: Order; onClose: () => void }) {
  const { refresh, flush, saveFinanceDraft } = useStore()
  const [retailer, setRetailer] = useState('')
  const refunds = (campaign.refunds || []).filter(r => r.orderId === order.id && reserved(r.status))
  const remaining = Math.max(0, (order.totalCents ?? Math.round(order.total * 100)) - refunds.reduce((sum, r) => sum + r.amountCents, 0))
  const [amount, setAmount] = useState((remaining / 100).toFixed(2))
  const [review, setReview] = useState<FinanceAction | null>(() => campaign.financeOperations?.find(op => op.status === 'pending' && op.action.kind === 'refund' && op.action.orderId === order.id && !campaign.refunds?.some(refund => refund.operationId === op.id))?.action || null)
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const content = useRef<HTMLDivElement>(null)
  const [selectorOpen, setSelectorOpen] = useState(false)
  const selecting = useRef(false)
  selecting.current = selectorOpen
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    content.current?.focus()
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || selecting.current) return
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
    await refresh()
    setReview(null)
    setDone(result.refund.status === 'COMPLETED' ? `${dollars(result.refund.amountCents)} refunded` : 'Refund submitted')
    await saveFinanceDraft(campaign.id, { financeOperations: operations.map(op => op.id === review.operationId ? { ...op, status: 'completed' as const, resultId: result.refund.id } : op) })
  }
  const activeRetailer = review?.retailer ?? retailer
  const items = activeRetailer ? order.items.filter(item => item.supplier.toLowerCase().replace(/^www\./, '').replace(/\.$/, '') === activeRetailer) : order.items
  const retailerCount = new Set(items.map(item => item.supplier)).size
  const quantity = items.reduce((sum, item) => sum + item.qty, 0)
  const transition = { duration: reducedMotion ? 0 : 0.18, ease: 'easeOut' as const }
  function chooseRetailer(domain: string) {
    setRetailer(domain)
    const portion = order.payouts?.items.find(item => item.retailer === domain)
    const used = refunds.filter(refund => refund.retailer === domain).reduce((sum, refund) => sum + refund.amountCents, 0)
    setAmount((Math.max(0, portion ? Math.min(remaining, portion.amountCents - used) : remaining) / 100).toFixed(2))
    setError('')
  }
  const options = [{ value: '', label: 'Whole purchase' }, ...(order.payouts?.items || []).map(item => ({ value: item.retailer, label: item.retailer }))]
  return (
    <Modal open onClose={onClose} dismissable={!busy && !selectorOpen} title={done ? 'Return status' : review ? 'Confirm refund' : 'Return purchase'} className="max-w-lg">
      <div ref={content} tabIndex={-1} className="outline-none" aria-busy={busy}>
        <AnimatePresence mode="wait" initial={false}>
          {done ? (
            <motion.div key="done" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={transition} className="flex flex-col items-center gap-5 py-5 text-center">
              <span className="inline-flex size-12 items-center justify-center rounded-full bg-success text-success-foreground"><Check className="size-5" /></span>
              <p className="font-serif text-2xl">{done}</p>
              <Pressable onClick={onClose} className="w-full">Done</Pressable>
            </motion.div>
          ) : (
            <motion.div key={review ? 'review' : 'form'} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={transition} className="flex flex-col gap-5">
              {!review && order.payouts && (
                <div>
                  <Label htmlFor={`return-retailer-${order.id}`}>Return from</Label>
                  <Select.Root value={retailer} onValueChange={value => chooseRetailer(value || '')} disabled={busy} onOpenChange={setSelectorOpen} modal={false} items={options}>
                    <Select.Trigger id={`return-retailer-${order.id}`} className={`${inputClass} group flex cursor-pointer items-center justify-between text-left transition-[border-color,box-shadow] data-[popup-open]:border-brand focus-visible:ring-2 focus-visible:ring-ring`}>
                      <Select.Value />
                      <Select.Icon><ChevronDown className="size-4 text-muted-foreground transition-transform duration-200 group-data-[popup-open]:rotate-180 motion-reduce:transition-none" /></Select.Icon>
                    </Select.Trigger>
                    <Select.Portal container={content.current}>
                      <Select.Positioner sideOffset={6} alignItemWithTrigger={false} className="z-[70]">
                        <Select.Popup className="w-[var(--anchor-width)] origin-[var(--transform-origin)] overflow-hidden rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl transition-[opacity,transform] duration-150 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 motion-reduce:transition-none">
                          <Select.List className="max-h-56 overflow-y-auto outline-none">
                            {options.map(option => <Select.Item key={option.value} value={option.value} className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm outline-none transition-colors data-[highlighted]:bg-muted data-[selected]:text-brand">
                              <Select.ItemText className="flex-1 truncate">{option.label}</Select.ItemText>
                              <Select.ItemIndicator><Check className="size-4" /></Select.ItemIndicator>
                            </Select.Item>)}
                          </Select.List>
                        </Select.Popup>
                      </Select.Positioner>
                    </Select.Portal>
                  </Select.Root>
                </div>
              )}
              <motion.div layout={!reducedMotion} transition={transition} className="overflow-hidden rounded-xl border border-border bg-muted/30">
                <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                  <Package className="size-4 text-muted-foreground" />
                  <p className="flex-1 text-sm font-medium">{quantity.toLocaleString()} {quantity === 1 ? 'item' : 'items'} <span className="font-normal text-muted-foreground">· {retailerCount} {retailerCount === 1 ? 'retailer' : 'retailers'}</span></p>
                </div>
                <ul className="max-h-44 divide-y divide-border overflow-y-auto">
                  {items.map(item => <li key={item.id} className="flex items-start justify-between gap-4 px-4 py-3">
                    <div className="min-w-0"><p className="text-sm leading-snug">{item.name}</p><p className="mt-1 text-xs text-muted-foreground">{item.supplier} · Qty {item.qty.toLocaleString()}</p></div>
                    <span className="shrink-0 text-sm tabular">{dollars((item.unitPriceCents ?? Math.round(item.unitPrice * 100)) * item.qty)}</span>
                  </li>)}
                </ul>
              </motion.div>
              {review ? (
                <>
                  <div className="flex items-end justify-between gap-4 py-1"><div><p className="text-sm text-muted-foreground">Refund to original buyer</p><p className="mt-1 text-3xl font-medium tracking-tight tabular">{dollars(review.amountCents)}</p></div><span className="pb-1 text-xs text-muted-foreground">via PayPal</span></div>
                  <div className="flex gap-2"><Pressable variant="secondary" disabled={busy} onClick={() => setReview(null)}>Back</Pressable><Pressable className="flex-1" disabled={busy} onClick={() => run(confirmRefund)}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : 'Confirm refund'}</Pressable></div>
                </>
              ) : (
                <>
                  <div><div className="mb-2 flex items-center justify-between"><Label htmlFor={`return-amount-${order.id}`}>Refund amount</Label><span className="text-xs text-muted-foreground">USD</span></div><input id={`return-amount-${order.id}`} className={`${inputClass} tabular`} type="number" min="0.01" step="0.01" value={amount} disabled={busy} onChange={event => setAmount(event.target.value)} /></div>
                  <Pressable className="w-full" disabled={busy || !Number.isFinite(Number(amount)) || Number(amount) <= 0} onClick={() => run(prepareRefund)}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : 'Review refund'}</Pressable>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
        {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
      </div>
    </Modal>
  )
}
