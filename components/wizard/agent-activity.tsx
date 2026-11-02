'use client'

import { AnimatePresence, motion } from 'motion/react'
import { Check, Loader2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { spring } from '../motion-provider'
import { AGENT_STEPS } from '@/lib/agent'
import { requestPlan } from '@/lib/discovery-client'
import { planTotals, usd, usdPrecise } from '@/lib/format'
import type { Plan } from '@/lib/types'
import { cn } from '@/lib/utils'

const STEP_MS = 1100

function buildThoughts(prompt: string, plan: Plan, budget: number) {
  const people = prompt.match(/([\d,]+)\s+(?:[a-z-]+\s+)?(families|people|households|residents)/i)
  const suppliers = Array.from(new Set(plan.items.map((i) => i.supplier)))
  const categories = Array.from(new Set(plan.items.map((i) => i.category)))
  const { total } = planTotals(plan)
  return [
    [people ? `Population: ${people[1]} ${people[2].toLowerCase()}` : 'Population: inferred from region', `Budget ceiling: ${usd(budget)}`],
    [`Priority categories: ${categories.join(', ')}`, 'Water: 15 L per person per day'],
    suppliers.slice(0, 4).map((s) => `Found ${s}`),
    plan.items.slice(0, 3).map((i) => `${i.name} · ${usdPrecise(i.unitPrice)} · ${i.delivery}`),
    [`Allocated ${usd(total)} across ${plan.items.length} items`, `Reserve: ${usd(Math.max(0, budget - total))}`],
    [`${suppliers.length} suppliers · ${plan.reasoning.length} justifications`],
  ]
}

export function AgentActivity({
  prompt,
  budget,
  onDone,
  onProgress,
  onError,
  requestContext,
}: {
  prompt: string
  requestContext?: string
  budget: number
  onDone: (p: Plan) => void
  onProgress: (n: number) => void
  onError?: (message: string) => void
}) {
  const [active, setActive] = useState(0)
  const [details, setDetails] = useState('Connecting to discovery')
  const cbs = useRef({ onDone, onProgress, onError })
  cbs.current = { onDone, onProgress, onError }
  const started = useRef(false)
  const thoughts = AGENT_STEPS.map(() => [details])
  useEffect(() => {
    if (started.current) return
    started.current = true
    requestPlan({ prompt: requestContext ?? prompt, budget }, (stage, detail) => {
      const mapped = [0, 2, 4, 5][stage] ?? 0
      setActive(mapped); setDetails(detail); cbs.current.onProgress(mapped)
    }).then(plan => { setActive(6); cbs.current.onDone(plan) })
      .catch(error => cbs.current.onError?.(error instanceof Error ? error.message : 'Discovery failed'))
  }, [prompt, budget, requestContext])

  return (
    <div className="flex flex-col gap-8" aria-live="polite">
      <div>
        <p className="shimmer-text font-serif text-4xl tracking-tight sm:text-5xl">Building your proposal</p>
        <p className="mt-3 line-clamp-2 max-w-xl text-muted-foreground">{prompt}</p>
      </div>

      <ol className="relative flex flex-col">
        <span className="absolute bottom-4 left-[15px] top-4 w-px bg-border" aria-hidden />
        <motion.span
          className="absolute bottom-4 left-[15px] top-4 w-px origin-top bg-foreground"
          aria-hidden
          initial={{ scaleY: 0 }}
          animate={{ scaleY: Math.min(active, AGENT_STEPS.length - 1) / (AGENT_STEPS.length - 1) }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        />
        {AGENT_STEPS.map((s, i) => {
          const state = i < active ? 'done' : i === active ? 'active' : 'pending'
          return (
            <li key={s.label} className="relative flex gap-4 py-2.5">
              <span
                className={cn(
                  'relative z-10 inline-flex size-[31px] shrink-0 items-center justify-center rounded-full border transition-colors duration-300',
                  state === 'done' && 'border-foreground bg-foreground text-background',
                  state === 'active' && 'border-brand bg-card text-brand',
                  state === 'pending' && 'border-border bg-background text-muted-foreground',
                )}
              >
                <AnimatePresence mode="popLayout" initial={false}>
                  {state === 'done' ? (
                    <motion.span key="d" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={spring}>
                      <Check className="size-3.5" strokeWidth={3} />
                    </motion.span>
                  ) : state === 'active' ? (
                    <motion.span key="a" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                      <Loader2 className="size-3.5 animate-spin" />
                    </motion.span>
                  ) : (
                    <motion.span key="p" className="size-1.5 rounded-full bg-current" exit={{ scale: 0 }} />
                  )}
                </AnimatePresence>
              </span>
              <div className="min-w-0 flex-1 pt-1">
                <p className={cn('font-medium transition-colors', state === 'pending' && 'text-muted-foreground')}>{s.label}</p>
                <AnimatePresence initial={false}>
                  {state !== 'pending' && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <p className="text-sm text-muted-foreground">{i === active ? details : s.label}</p>
                      <ul className="mt-1.5 flex flex-col gap-1">
                        {thoughts[i].map((t, k) => (
                          <motion.li
                            key={t}
                            initial={{ opacity: 0, x: -6 }}
                            animate={{ opacity: 1, x: 0, transition: { delay: 0.15 + k * 0.18 } }}
                            className="font-mono text-xs text-muted-foreground/80"
                          >
                            <span className="text-brand">›</span> {t}
                          </motion.li>
                        ))}
                      </ul>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
