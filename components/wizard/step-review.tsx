'use client'

import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, ArrowRight, ArrowUp, Minus, Plus, Sparkles, Trash2 } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { AnimatedNumber, Card, Pressable } from '../kit'
import { softSpring } from '../motion-provider'
import { estimatedPlan as recalcPlan } from '@/lib/money'
import { requestPlan } from '@/lib/discovery-client'
import { planTotals, usdPrecise } from '@/lib/format'
import type { Plan } from '@/lib/types'
import { cn } from '@/lib/utils'

export function StepReview({
  plan,
  setPlan,
  prompt,
  budget,
  onBack,
  onNext,
  onBusyChange,
}: {
  plan: Plan
  setPlan: (p: Plan) => void
  prompt: string
  budget: number
  onBack: () => void
  onNext: () => void
  onBusyChange: (busy: boolean) => void
}) {
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [revising, setRevising] = useState(false)
  const revisionLock = useRef(false)
  const [revision, setRevision] = useState<{ before: Plan; after: Plan; request: string } | null>(null)
  const [revisionProgress, setRevisionProgress] = useState('')
  const { subtotal, total } = planTotals(plan)
  const over = total > budget
  const fmt = useCallback((n: number) => usdPrecise(n), [])

  const setQty = (id: string, qty: number) =>
    setPlan(recalcPlan({ ...plan, items: plan.items.map((i) => (i.id === id ? { ...i, qty: Math.max(1, qty) } : i)) }))
  const remove = (id: string) => setPlan(recalcPlan({ ...plan, items: plan.items.filter((i) => i.id !== id) }))

  const revise = async () => {
    if (!feedback.trim() || revisionLock.current) return
    revisionLock.current = true
    onBusyChange(true)
    setRevising(true)
    setError('')
    setRevision(null)
    setRevisionProgress('Reviewing your requested changes…')
    try {
      const next = await requestPlan({ prompt, budget, feedback, currentPlan: plan }, (_, detail) => setRevisionProgress(detail))
      setPlan(next)
      setRevision({ before: plan, after: next, request: feedback.trim() })
      // Preserve the request for retry when the provider retains the original plan.
      if (!next.fallbackReason) setFeedback('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Revision failed')
    } finally {
      revisionLock.current = false
      setRevising(false)
      onBusyChange(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {revision && revision.after === plan && <RevisionSummary before={revision.before} after={revision.after} request={revision.request} budget={budget} />}
      <div className="flex items-end justify-between gap-4">
        <h1 className="font-serif text-4xl tracking-tight sm:text-5xl">Proposal</h1>
        <span className="text-sm text-muted-foreground tabular">
          {plan.items.length} items · {new Set(plan.items.map((i) => i.supplier)).size} suppliers
        </span>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_250px]">
        <div className="flex min-w-0 flex-col gap-4">
          <fieldset disabled={revising} className="min-w-0">
            <Card className="relative overflow-hidden">
              <ul>
                <AnimatePresence initial={false}>
                  {plan.items.map((item, i) => (
                    <motion.li
                      key={item.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0, transition: { delay: i * 0.04 } }}
                      exit={{ opacity: 0, x: -20, transition: { duration: 0.2 } }}
                      className="group flex items-center gap-3 border-b border-border px-4 py-3.5 last:border-0"
                    >
                      {item.imageUrl && <a href={item.productUrl} target="_blank" rel="noreferrer" className="shrink-0" aria-label={`View ${item.name}`}><img src={item.imageUrl} alt="" className="size-9 rounded-md object-contain" /></a>}
                      <div className="min-w-0 flex-1">
                        <p className="text-pretty text-[15px] font-medium leading-snug">{item.productUrl ? <a href={item.productUrl} target="_blank" rel="noreferrer" className="hover:underline">{item.name}</a> : item.name}</p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {item.supplier} · {usdPrecise(item.unitPrice)} · {item.delivery}
                        </p>
                      </div>
                      <div className="flex items-center rounded-full border border-border">
                        <button
                          onClick={() => setQty(item.id, item.qty - Math.max(1, Math.round(item.qty * 0.1)))}
                          aria-label={`Decrease ${item.name}`}
                          className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <Minus className="size-3" />
                        </button>
                        <label className="sr-only" htmlFor={`q-${item.id}`}>
                          Quantity for {item.name}
                        </label>
                        <input
                          id={`q-${item.id}`}
                          inputMode="numeric"
                          value={item.qty}
                          onChange={(e) => setQty(item.id, Number(e.target.value.replace(/\D/g, '').slice(0, 6)) || 1)}
                          className="w-12 bg-transparent text-center text-sm outline-none tabular"
                        />
                        <button
                          onClick={() => setQty(item.id, item.qty + Math.max(1, Math.round(item.qty * 0.1)))}
                          aria-label={`Increase ${item.name}`}
                          className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <Plus className="size-3" />
                        </button>
                      </div>
                      <span className="hidden w-20 text-right text-sm tabular sm:block">{usdPrecise(item.qty * item.unitPrice)}</span>
                      <button
                        onClick={() => remove(item.id)}
                        aria-label={`Remove ${item.name}`}
                        className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground opacity-60 transition hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
              {plan.items.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted-foreground">No items. Ask the agent below.</p>}

              <AnimatePresence>
                {revising && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 flex items-center justify-center bg-card/80 backdrop-blur-sm"
                  >
                    <div role="status" className="px-5 text-center"><p className="shimmer-text font-serif text-2xl">Revising proposal…</p><p className="mt-2 text-sm text-muted-foreground">{revisionProgress}</p></div>
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>
          </fieldset>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              revise()
            }}
            className="flex items-center gap-2 rounded-full border border-border bg-card p-1.5 pl-4 transition-[border-color,box-shadow] focus-within:border-brand focus-within:shadow-[0_0_0_4px_var(--brand-soft)]"
          >
            <Sparkles className="size-4 shrink-0 text-brand" />
            <label htmlFor="feedback" className="sr-only">
              Request changes
            </label>
            <input
              id="feedback"
              disabled={revising}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.nativeEvent.isComposing || e.keyCode === 229)) e.preventDefault()
              }}
              placeholder="Try “halve the water quantity; keep everything else”"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <Pressable type="submit" size="icon" disabled={!feedback.trim() || revising} aria-label="Send">
              <ArrowUp />
            </Pressable>
          </form>

          <div className="rounded-2xl bg-muted/60 p-5">
            <p className="mb-3 flex items-center gap-2 text-sm font-medium">
              <Sparkles className="size-4 text-brand" /> Why this plan
            </p>
            <ul className="flex list-disc flex-col gap-2 pl-4">
              {plan.items.map((item, i) => (
                <motion.li
                  key={item.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0, transition: { delay: 0.2 + i * 0.06 } }}
                  className="text-sm leading-relaxed text-muted-foreground"
                >
                  <span className="font-medium text-foreground">{item.name}:</span> {item.explanation || 'Selected to support the campaign’s requested supplies.'}
                </motion.li>
              ))}
            </ul>
          </div>
        </div>

        <aside className="xl:sticky xl:top-26 xl:self-start">
          <Card className="p-5">
            <dl className="flex flex-col gap-2.5 text-sm">
              <Row label="Items" value={usdPrecise(subtotal)} />
              <Row label="Shipping (estimated)" value={usdPrecise(plan.shipping)} />
              <Row label="Non-profit discount" value={`−${usdPrecise(plan.discount)}`} accent />
              <Row label="Tax (estimated)" value={usdPrecise(plan.tax)} />
            </dl>
            <div className="my-4 h-px bg-border" />
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-3xl font-medium tracking-tight">
              <AnimatedNumber value={total} format={fmt} />
            </p>

            <div className="mt-4">
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <motion.div
                  className={cn('h-full origin-left rounded-full', over ? 'bg-destructive' : 'bg-foreground')}
                  animate={{ scaleX: Math.min(1, total / budget) }}
                  transition={softSpring}
                />
              </div>
              <p className={cn('mt-2 text-xs tabular', over ? 'text-destructive' : 'text-muted-foreground')}>
                {over ? `${usdPrecise(total - budget)} over budget` : `${usdPrecise(budget - total)} remaining of ${usdPrecise(budget)}`}
              </p>
            </div>

            <Pressable size="lg" className="mt-5 w-full" disabled={revising || over || plan.items.length === 0} onClick={onNext}>
              Checkout <ArrowRight />
            </Pressable>
            <Pressable variant="ghost" size="sm" className="mt-2 w-full" disabled={revising} onClick={onBack}>
              <ArrowLeft /> Edit request
            </Pressable>
          </Card>
        </aside>
      </div>
    </div>
  )
}

function RevisionSummary({ before, after, request, budget }: { before: Plan; after: Plan; request: string; budget: number }) {
  const changes = [...before.items.map(item => {
    const next = after.items.find(p => p.id === item.id)
    if (!next) return `Removed ${item.name} (${item.qty} units)`
    if (next.qty !== item.qty) return `${item.name}: ${item.qty} → ${next.qty} units`
    return null
  }), ...after.items.filter(item => !before.items.some(p => p.id === item.id)).map(item => `Added ${item.name}: ${item.qty} units`)].filter(Boolean)
  const unchanged = before.items.filter(item => after.items.some(p => p.id === item.id && p.qty === item.qty)).length
  const previousTotal = planTotals(before).total
  const nextTotal = planTotals(after).total
  return <Card className="p-5" role="status">
    <h2 className="font-medium">{after.fallbackReason ? 'Requested changes were not applied' : changes.length ? 'Review your revised proposal' : 'No item changes returned'}</h2>
    <p className="mt-2 break-words text-sm text-muted-foreground">Your request: {request}</p>
    <ul className="mt-3 space-y-1 text-sm">{changes.map((change, i) => <li key={i}>{change}</li>)}</ul>
    <p className="mt-3 text-sm">{unchanged} item types unchanged · Total {usdPrecise(previousTotal)} → {usdPrecise(nextTotal)}</p>
    <p className="mt-1 text-sm text-muted-foreground">{nextTotal <= budget ? `${usdPrecise(budget - nextTotal)} within the available budget` : `${usdPrecise(nextTotal - budget)} over budget`}. Review the product explanations below before checkout.</p>
  </Card>
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('tabular', accent && 'text-success')}>{value}</dd>
    </div>
  )
}
