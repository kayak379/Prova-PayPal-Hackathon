'use client'
import { useState } from 'react'
import type { Order, PayoutSummary } from '@/lib/types'
import { useStore } from '@/lib/store'
import { usdPrecise } from '@/lib/format'
import { Pressable } from '../kit'

export function RetailerRecovery({ campaignId, order }: { campaignId: string; order: Order }) {
  const { refresh, flush } = useStore()
  const [selected, setSelected] = useState<string[]>([])
  const [review, setReview] = useState<{ payouts: PayoutSummary; token: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const payouts = order.payouts!
  async function action(action: string) {
    setBusy(true); setError('')
    try {
      await flush()
      const response = await fetch('/api/checkout/recovery', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, campaignId, orderId: order.id, itemIds: selected.length ? selected : undefined, token: review?.token }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      setReview(action === 'prepare' ? result : null)
      await refresh()
    } catch (error) { setError(error instanceof Error ? error.message : 'Recovery unavailable.') }
    finally { setBusy(false) }
  }
  const returned = payouts.items.filter(item => ['RETURNED', 'REFUNDED'].includes(item.status)).reduce((sum, item) => sum + item.amountCents, 0)
  return <section className="mt-4 flex flex-col gap-3 border-t border-border pt-4 text-sm">
    <h4 className="font-medium">Recover retailer payments</h4>
    <p className="text-xs text-muted-foreground">This returns retailer funds to the paying account, separately from a buyer refund. Completed payouts require the recipient to issue a return in PayPal. Only unclaimed payouts can be cancelled here. Stopping an unsent batch stops all its retailer payments.</p>
    <p className="text-xs">Returned by retailers: {usdPrecise(returned / 100)}. These returns are not credited again to the campaign budget.</p>
    {(review?.payouts || payouts).items.map(item => <label key={item.senderItemId} className="flex items-start gap-2 text-xs">
      <input type="checkbox" disabled={busy || !!review} checked={selected.includes(item.senderItemId)} onChange={e => setSelected(e.target.checked ? [...selected, item.senderItemId] : selected.filter(id => id !== item.senderItemId))} />
      <span>{item.retailer} · {usdPrecise(item.amountCents / 100)} · {item.status === 'SUCCESS' ? 'Return required from recipient' : item.status.toLowerCase().replaceAll('_', ' ')}{item.error && <span className="block text-destructive">{item.error}</span>}</span>
    </label>)}
    {review ? <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
      <p className="text-xs">Confirm recovery for the selected retailers. Eligible unclaimed payouts will be cancelled; completed payments remain outstanding until PayPal confirms a return. The buyer will not be refunded by this action.</p>
      {review.payouts.error && <p className="text-xs text-destructive">{review.payouts.error}</p>}
      <div className="flex gap-2"><Pressable size="sm" disabled={busy} onClick={() => action('confirm')}>Confirm recovery</Pressable><Pressable variant="ghost" size="sm" disabled={busy} onClick={() => setReview(null)}>Back</Pressable></div>
    </div> : <div className="flex flex-wrap gap-2"><Pressable size="sm" disabled={busy || !selected.length} onClick={() => action('prepare')}>Review recovery</Pressable><Pressable variant="ghost" size="sm" disabled={busy} onClick={() => action('refresh')}>Refresh returns</Pressable></div>}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </section>
}
