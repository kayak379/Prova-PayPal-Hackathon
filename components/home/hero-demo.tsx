'use client'

import { AnimatePresence, motion } from 'motion/react'
import { Check, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { PayPalWordmark } from '../brand'

const STAGES = ['request', 'plan', 'paid'] as const

export function HeroDemo() {
  const [i, setI] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % STAGES.length), 3200)
    return () => clearInterval(t)
  }, [])

  const stage = STAGES[i]

  return (
    <div className="relative mx-auto w-full max-w-md" aria-hidden>
      <div className="absolute -inset-8 -z-10 rounded-[48px] bg-[radial-gradient(60%_60%_at_50%_40%,var(--brand-soft),transparent)]" />
      <motion.div layout className="overflow-hidden rounded-[28px] border border-border bg-card p-6 shadow-[0_30px_80px_-30px_rgba(15,20,30,0.35)]">
        <div className="mb-5 flex items-center gap-2">
          {STAGES.map((s, idx) => (
            <div key={s} className="relative h-1 flex-1 overflow-hidden rounded-full bg-muted">
              {idx <= i && (
                <motion.div
                  className="absolute inset-0 origin-left rounded-full bg-foreground"
                  initial={{ scaleX: idx === i ? 0 : 1 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: idx === i ? 3 : 0, ease: 'linear' }}
                />
              )}
            </div>
          ))}
        </div>

        <AnimatePresence mode="popLayout" initial={false}>
          {stage === 'request' && (
            <motion.div key="request" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
              <p className="text-xs font-medium text-muted-foreground">Request</p>
              <p className="mt-2 text-lg leading-snug">
                Category 4 hurricane, 2,000 displaced families in Houston. Need water, shelter and first aid.
              </p>
              <div className="mt-5 flex items-center justify-between">
                <span className="rounded-full bg-muted px-3 py-1 text-sm tabular">$25,000</span>
                <motion.span layoutId="hero-pill" className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-sm text-background">
                  <Sparkles className="size-3.5" /> Build
                </motion.span>
              </div>
            </motion.div>
          )}
          {stage === 'plan' && (
            <motion.div key="plan" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
              <p className="text-xs font-medium text-muted-foreground">Proposal</p>
              <ul className="mt-3 flex flex-col gap-2">
                {[
                  ['Drinking water', 'AquaRelief', '$8,240'],
                  ['Sleeping bags', 'Basecamp', '$6,105'],
                  ['First aid kits', 'MedLine', '$4,400'],
                  ['Hygiene kits', 'CleanStart', '$3,750'],
                ].map(([n, s, p], k) => (
                  <motion.li
                    key={n}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0, transition: { delay: 0.08 * k } }}
                    className="flex items-center justify-between rounded-xl bg-muted/60 px-3 py-2.5 text-sm"
                  >
                    <span>
                      {n} <span className="text-muted-foreground">· {s}</span>
                    </span>
                    <span className="tabular">{p}</span>
                  </motion.li>
                ))}
              </ul>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total</span>
                <motion.span layoutId="hero-pill" className="rounded-full bg-foreground px-4 py-2 text-sm text-background tabular">
                  $22,495
                </motion.span>
              </div>
            </motion.div>
          )}
          {stage === 'paid' && (
            <motion.div key="paid" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="flex flex-col items-center py-4 text-center">
              <motion.span
                layoutId="hero-pill"
                style={{ borderRadius: 999 }}
                className="inline-flex size-16 items-center justify-center bg-success text-success-foreground"
              >
                <Check className="size-7" strokeWidth={2.5} />
              </motion.span>
              <p className="mt-4 text-lg">4 orders confirmed</p>
              <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                via <PayPalWordmark className="text-sm" />
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
