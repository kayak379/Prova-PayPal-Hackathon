'use client'

import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { useId } from 'react'
import { Check } from 'lucide-react'
import { softSpring, spring } from '../motion-provider'
import { STEPS } from './stepper'
import { planTotals, usd } from '@/lib/format'
import type { Plan } from '@/lib/types'
import type { Draft } from './campaign-wizard'
import { PaymentTap } from './payment-tap'

const CORE = [
  { width: 56, height: 56, borderRadius: 28, backgroundColor: '#dce9d8' },
  { width: 18, height: 18, borderRadius: 9, backgroundColor: '#dce9d8' },
  { width: 132, height: 160, borderRadius: 18, backgroundColor: '#dce9d8' },
  { width: 172, height: 108, borderRadius: 16, backgroundColor: '#ffc439' },
]

const NODES = [
  { x: -78, y: -52 },
  { x: 84, y: -34 },
  { x: -60, y: 70 },
  { x: 70, y: 66 },
  { x: 4, y: -96 },
  { x: -102, y: 12 },
]

const CAPTIONS = ['Where and how much', 'Tell the agent what you need', 'Approve the plan', 'Pay suppliers via PayPal']

export function StepGraphic({
  step,
  agentProgress,
  draft,
  plan,
  paying,
  paymentComplete,
}: {
  step: number
  agentProgress: number
  draft: Draft
  plan: Plan | null
  paying: boolean
  paymentComplete: boolean
}) {
  const nodeCount = step === 1 ? Math.max(0, Math.min(NODES.length, agentProgress * 1.2)) : 0
  const total = plan ? planTotals(plan).total : 0
  const graphicId = useId()

  return (
    <div className="relative flex h-52 flex-col overflow-hidden rounded-[28px] bg-graphic text-graphic-foreground lg:h-full">
      <div className="absolute inset-0 bg-[radial-gradient(70%_50%_at_50%_45%,rgba(255,255,255,0.07),transparent)]" />

      <LayoutGroup id={graphicId}>
      <div className="relative flex flex-1 items-center justify-center">
        {/* Campaign: pulse rings */}
        <AnimatePresence>
          {step === 0 && (
            <motion.div key="rings" className="absolute inset-0 flex items-center justify-center" exit={{ opacity: 0 }}>
              {[0, 1, 2].map((r) => (
                <span
                  key={r}
                  className="animate-ring absolute size-14 rounded-full border-2 border-[#dce9d8]/90"
                  style={{ animationDelay: `${r}s` }}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Request: radar */}
        <AnimatePresence>
          {step === 1 && (
            <motion.div
              key="radar"
              className="absolute inset-0 flex items-center justify-center"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
            >
              {[220, 150, 80].map((s) => (
                <span key={s} className="absolute rounded-full border border-[#dce9d8]/35" style={{ width: s, height: s }} />
              ))}
              <span
                className="absolute size-[220px] animate-spin rounded-full bg-[conic-gradient(from_0deg,transparent_0deg,transparent_300deg,#b7d2b9_360deg)] opacity-80"
                style={{ animationDuration: agentProgress >= 0 ? '1.4s' : '4s' }}
              />
              {NODES.map((n, i) => (
                <AnimatePresence key={i}>
                  {i < nodeCount && (
                    <>
                      <motion.svg
                        className="pointer-events-none absolute overflow-visible"
                        width="1"
                        height="1"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                      >
                        <motion.line
                          x1="0"
                          y1="0"
                          x2={n.x}
                          y2={n.y}
                          stroke="#dce9d8"
                          strokeOpacity="0.9"
                          strokeDasharray="3 4"
                          initial={{ pathLength: 0 }}
                          animate={{ pathLength: 1 }}
                          transition={{ duration: 0.5 }}
                        />
                      </motion.svg>
                      <motion.span
                        className="absolute size-2.5 rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,0.7)]"
                        initial={{ x: 0, y: 0, scale: 0 }}
                        animate={{ x: n.x, y: n.y, scale: 1 }}
                        transition={spring}
                      />
                    </>
                  )}
                </AnimatePresence>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {step === 3 ? <PaymentTap active={paying} complete={paymentComplete} /> : (
        <motion.div
          layoutId={step === 2 ? 'payment-surface' : undefined}
          className="relative flex items-center justify-center overflow-hidden"
          initial={false}
          animate={CORE[step]}
          transition={softSpring}
        >
          <AnimatePresence mode="wait">
            {step === 2 && (
              <motion.div key="sheet" className="flex w-full flex-col gap-2.5 p-4" exit={{ opacity: 0 }}>
                {[0.9, 0.7, 0.8, 0.55, 0.75].map((w, i) => (
                  <motion.span
                    key={i}
                    className="h-2 rounded-full bg-[#214e3a]/45"
                    initial={{ width: 0 }}
                    animate={{ width: `${w * 100}%` }}
                    transition={{ delay: 0.25 + i * 0.07, ...softSpring }}
                  />
                ))}
                <motion.span
                  layoutId="payment-card"
                  className="mt-2 h-5 w-14 self-end rounded-md bg-[#214e3a]"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.7, ...spring }}
                />
              </motion.div>
            )}
            {step === 3 && (
              <motion.div key="card" className="flex size-full flex-col justify-between p-4 text-paypal-navy" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.25 } }} exit={{ opacity: 0 }}>
                <span className="h-5 w-7 rounded bg-paypal-navy/20" />
                <span className="flex items-end justify-between">
                  <span className="text-sm font-extrabold italic">PayPal</span>
                  <motion.span
                    className="inline-flex size-7 items-center justify-center rounded-full bg-paypal-navy text-white"
                    initial={{ scale: 0, rotate: -90 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ delay: 0.5, ...spring }}
                  >
                    <Check className="size-4" strokeWidth={3} />
                  </motion.span>
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
        )}
      </div>
      </LayoutGroup>

      <div className="relative flex items-end justify-between gap-4 p-5 lg:p-6">
        <div className="min-w-0">
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              <p className="text-xs font-medium text-[#dce9d8] tabular">0{step + 1} / 04</p>
              <p className="mt-1 font-serif text-2xl leading-tight text-white lg:text-3xl">{STEPS[step]}</p>
              <p className="mt-0.5 hidden text-sm text-[#e0e9df] lg:block">{CAPTIONS[step]}</p>
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="shrink-0 text-right">
          {draft.name && <p className="max-w-[140px] truncate text-xs text-[#dce9d8]">{draft.name}</p>}
          <p className="text-sm font-medium tabular">
            {total > 0 && step >= 2 ? `${usd(total)} / ${usd(draft.budget)}` : usd(draft.budget || 0)}
          </p>
        </div>
      </div>
    </div>
  )
}
