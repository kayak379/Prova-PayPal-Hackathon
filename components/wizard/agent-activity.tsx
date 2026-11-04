'use client'

import { useEffect, useRef, useState } from 'react'
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from 'motion/react'
import { requestPlan } from '@/lib/discovery-client'
import { usd } from '@/lib/format'
import type { Plan } from '@/lib/types'
import { cn } from '@/lib/utils'
import { AgentGlyph } from './agent-glyph'
import { useAgentPlayback, type ActivityEvent } from './use-agent-playback'
import { AGENT_CYCLE_MS, AGENT_SETTLE_MS } from '@/lib/agent-pacing'
export type { ActivityEvent } from './use-agent-playback'

const STAGES = [
  {
    title: 'Understanding the need',
    tool: 'AI planning',
    description:
      'Interpreting the emergency, identifying priorities, and planning targeted supply searches.',
  },
  {
    title: 'Finding the perfect products',
    tool: 'Searching Channel3',
    description:
      'Searching bulk and industrial suppliers, finding priced products, and comparing options.',
  },
  {
    title: 'Building the best bundle',
    tool: 'Selecting + allocating',
    description:
      'Selecting useful supplies and balancing quantities to make the most of your budget.',
  },
  {
    title: 'Checking the proposal',
    tool: 'Verifying prices + budget',
    description:
      'Verifying product references and calculating totals, including estimated shipping and tax.',
  },
]

export function AgentActivity({
  prompt,
  requestContext,
  budget,
  onDone,
  onProgress,
  onError,
}: {
  prompt: string
  requestContext?: string
  budget: number
  onDone: (p: Plan) => void
  onProgress: (n: number) => void
  onError?: (message: string) => void
}) {
  const [received, setReceived] = useState<ActivityEvent[]>([
    {
      stage: 0,
      detail: 'Reading your request and preparing the supply search.',
    },
  ])
  const cbs = useRef({ onDone, onProgress, onError })
  cbs.current = { onDone, onProgress, onError }
  const started = useRef(false)
  const mounted = useRef(false)
  const [result, setResult] = useState<Plan | null>(null)
  const events = useAgentPlayback(
    received,
    result !== null,
    () => {
      if (result && mounted.current) cbs.current.onDone(result)
    },
    (stage) => cbs.current.onProgress(stage),
  )

  useEffect(() => {
    mounted.current = true
    if (!started.current) {
      started.current = true
      requestPlan(
        { prompt: requestContext ?? prompt, budget },
        (stage, detail) => {
          if (!mounted.current) return
          const normalized = Math.max(0, Math.min(3, stage))
          setReceived((previous) =>
            previous.at(-1)?.stage === normalized &&
            previous.at(-1)?.detail === detail
              ? previous
              : [...previous, { stage: normalized, detail }],
          )
        },
      )
        .then((plan) => {
          if (mounted.current) setResult(plan)
        })
        .catch((error) => {
          if (mounted.current)
            cbs.current.onError?.(
              error instanceof Error ? error.message : 'Discovery failed',
            )
        })
    }
    return () => {
      mounted.current = false
    }
  }, [prompt, budget, requestContext])

  return <AgentActivityView events={events} prompt={prompt} budget={budget} />
}

export function AgentActivityView({
  events,
  prompt,
  budget,
}: {
  events: ActivityEvent[]
  prompt: string
  budget: number
}) {
  const reduced = useReducedMotion()
  const scroller = useRef<HTMLDivElement>(null)
  const [activeTop, setActiveTop] = useState(16)
  const active = events[events.length - 1].stage
  const cycle = useMotionValue(0)
  const shimmerPosition = useTransform(cycle, [0, 1], ['100% 50%', '0% 50%'])
  useEffect(() => {
    if (reduced) {
      cycle.set(1)
      return
    }
    cycle.set(0)
    const playback = animate(cycle, 1, {
      duration: AGENT_CYCLE_MS / 1000,
      delay: AGENT_SETTLE_MS / 1000,
      repeat: Infinity,
      ease: 'linear',
    })
    return () => playback.stop()
  }, [active, reduced, cycle])
  useEffect(() => {
    const element = scroller.current
    if (!element) return
    let frame = 0
    const scroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const row = element.querySelector<HTMLElement>('[data-active="true"]')
        if (row) {
          setActiveTop(row.offsetTop)
          element.scrollTo({
            top: Math.max(
              0,
              row.offsetTop + row.offsetHeight - element.clientHeight + 8,
            ),
            behavior: reduced ? 'instant' : 'smooth',
          })
        }
      })
    }
    const observer = new ResizeObserver(scroll)
    if (element.firstElementChild) observer.observe(element.firstElementChild)
    scroll()
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [events, reduced])

  return (
    <div className="flex flex-col gap-6">
      <div className="border-b border-border pb-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-brand">
            Your agent at work
          </p>
          <span className="text-xs text-muted-foreground tabular">
            {usd(budget)} limit
          </span>
        </div>
        <h1 className="font-serif text-4xl tracking-tight sm:text-5xl">
          From need to proposal
        </h1>
        <p className="mt-3 line-clamp-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
          {prompt}
        </p>
      </div>
      <div
        ref={scroller}
        role="region"
        aria-label="Agent progress, scrolls as updates arrive"
        tabIndex={0}
        className="agent-progress-scroll relative h-[min(420px,50dvh)] min-h-64 overflow-y-auto overscroll-contain pr-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ol className="space-y-6 py-4">
          {STAGES.map((stage, index) => {
            const updates = events.filter((event) => event.stage === index)
            if (!updates.length) return null
            const current = index === active
            return (
              <motion.li
                key={stage.title}
                layout="position"
                initial={reduced ? false : { opacity: 0, height: 0, y: 8 }}
                animate={{ opacity: 1, height: 'auto', y: 0 }}
                transition={{
                  duration: reduced ? 0 : 0.5,
                  ease: [0.22, 1, 0.36, 1],
                }}
                data-active={current}
                className="flex gap-4"
              >
                <AgentGlyph
                  stage={index}
                  active={false}
                  className={cn(
                    'size-10 shrink-0 transition-opacity duration-500',
                    current ? 'opacity-0' : 'opacity-40',
                  )}
                />
                <div className="min-w-0 flex-1 pb-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <motion.h2
                      style={
                        current
                          ? { backgroundPosition: shimmerPosition }
                          : undefined
                      }
                      className={cn(
                        'text-[15px] transition-colors duration-500',
                        current
                          ? 'agent-step-shimmer font-semibold'
                          : 'font-medium text-muted-foreground',
                      )}
                    >
                      {stage.title}
                    </motion.h2>
                    <span
                      className={cn(
                        'text-[11px] transition-colors duration-500',
                        current
                          ? 'font-medium text-brand'
                          : 'text-muted-foreground',
                      )}
                    >
                      {stage.tool}
                    </span>
                  </div>
                  <motion.p
                    style={
                      current
                        ? { backgroundPosition: shimmerPosition }
                        : undefined
                    }
                    className={cn(
                      'mt-1 text-sm leading-relaxed transition-colors duration-500',
                      current ? 'agent-step-shimmer' : 'text-muted-foreground',
                    )}
                  >
                    {stage.description}
                  </motion.p>
                  <ul className="mt-3 space-y-2 border-l border-border pl-3">
                    {updates.map((event, eventIndex) => (
                      <motion.li
                        key={eventIndex}
                        style={
                          current
                            ? { backgroundPosition: shimmerPosition }
                            : undefined
                        }
                        initial={reduced ? false : { opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.35 }}
                        className={cn(
                          'text-xs leading-relaxed',
                          current
                            ? 'agent-step-shimmer'
                            : 'text-muted-foreground',
                        )}
                      >
                        {event.detail}
                      </motion.li>
                    ))}
                  </ul>
                </div>
              </motion.li>
            )
          })}
        </ol>
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 size-10"
          initial={false}
          animate={{ y: activeTop }}
          transition={
            reduced
              ? { duration: 0 }
              : { type: 'spring', stiffness: 130, damping: 24, mass: 0.9 }
          }
        >
          <AgentGlyph
            stage={active}
            active
            progress={cycle}
            className="size-10"
          />
        </motion.div>
      </div>
      <p
        role="status"
        aria-live="polite"
        className="text-xs text-muted-foreground"
      >
        {events.at(-1)?.detail}
      </p>
    </div>
  )
}
