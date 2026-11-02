'use client'

import { motion, useReducedMotion } from 'motion/react'

export function FinanceRadar({ active }: { active: boolean }) {
  const reduced = useReducedMotion()
  return (
    <svg
      viewBox="0 0 56 56"
      className="size-14 shrink-0 text-brand"
      aria-hidden="true"
    >
      <circle cx="28" cy="28" r="25" fill="var(--brand-soft)" />
      {[10, 19].map((r) => (
        <circle
          key={r}
          cx="28"
          cy="28"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeOpacity=".2"
        />
      ))}
      <path d="M28 9 V47 M9 28 H47" stroke="currentColor" strokeOpacity=".12" />
      <motion.g
        key={String(active)}
        style={{ transformOrigin: '28px 28px' }}
        initial={false}
        animate={reduced ? {} : { rotate: [0, 360] }}
        transition={{
          duration: active ? 2 : 6,
          ease: 'linear',
          repeat: active ? Infinity : 0,
        }}
      >
        <path
          d="M28 28 L28 9 A19 19 0 0 1 47 28 Z"
          fill="currentColor"
          opacity=".1"
        />
        <path
          d="M28 28 V9"
          stroke="currentColor"
          strokeOpacity=".6"
          strokeLinecap="round"
        />
      </motion.g>
      <circle cx="37" cy="19" r="2.5" fill="currentColor" />
      <circle cx="18" cy="34" r="2" fill="currentColor" opacity=".5" />
      <circle cx="28" cy="28" r="3" fill="currentColor" />
    </svg>
  )
}
