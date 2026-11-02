'use client'

import { AnimatePresence, motion } from 'motion/react'
import { Check } from 'lucide-react'
import { spring } from '../motion-provider'
import { cn } from '@/lib/utils'

export const STEPS = ['Campaign', 'Request', 'Review', 'Checkout']

export function Stepper({
  step,
  minStep,
  onSelect,
}: {
  step: number
  minStep: number
  onSelect?: (i: number) => void
}) {
  return (
    <nav aria-label="Progress">
      <ol className="flex items-center gap-1 rounded-full bg-muted p-1">
        {STEPS.map((label, i) => {
          const active = i === step
          const done = i < step
          const clickable = !!onSelect && done && i >= minStep
          return (
            <li key={label}>
              <button
                type="button"
                disabled={!clickable}
                onClick={() => onSelect?.(i)}
                aria-current={active ? 'step' : undefined}
                className={cn(
                  'relative flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring sm:px-3',
                  active ? 'text-background' : done ? 'text-foreground' : 'text-muted-foreground',
                  clickable && 'hover:bg-background/70',
                )}
              >
                {active && (
                  <motion.span layoutId="stepper-pill" transition={spring} className="absolute inset-0 rounded-full bg-foreground" />
                )}
                <span className="relative inline-flex size-4 items-center justify-center">
                  <AnimatePresence mode="popLayout" initial={false}>
                    {done ? (
                      <motion.span key="c" initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} transition={spring}>
                        <Check className="size-3.5" strokeWidth={3} />
                      </motion.span>
                    ) : (
                      <motion.span key="n" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="tabular text-xs">
                        {i + 1}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </span>
                <span className={cn('relative', !active && 'hidden md:inline')}>{label}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
