'use client'

import { motion } from 'motion/react'

export function BudgetRing({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value))
  return (
    <div className="relative size-24 shrink-0">
      <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r="42" fill="none" stroke="var(--muted)" strokeWidth="9" />
        <motion.circle
          cx="50"
          cy="50"
          r="42"
          fill="none"
          stroke="var(--brand)"
          strokeWidth="9"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: pct }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-medium tabular">
        {Math.round(pct * 100)}%
      </span>
    </div>
  )
}
