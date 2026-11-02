'use client'

import { motion, useReducedMotion } from 'motion/react'

export function FinanceMoney({ active }: { active: boolean }) {
  const reduced = useReducedMotion()
  return (
    <svg
      viewBox="0 0 56 56"
      className="size-14 shrink-0 text-brand"
      aria-hidden="true"
    >
      <circle cx="28" cy="28" r="25" fill="var(--brand-soft)" />
      {[40, 35, 30].map((y, i) => (
        <motion.g
          key={y}
          initial={reduced ? false : { opacity: 0, y: -5 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: i * 0.12, duration: 0.4 }}
        >
          <rect
            x="13"
            y={y - 4}
            width="24"
            height="7"
            rx="3.5"
            fill="var(--card)"
            stroke="currentColor"
            strokeOpacity=".5"
          />
        </motion.g>
      ))}
      <motion.g
        initial={false}
        animate={reduced ? { y: 0 } : { y: [0, -2, 0] }}
        transition={{
          duration: active ? 2 : 5,
          delay: 1,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      >
        <circle cx="33" cy="23" r="12" fill="var(--primary)" />
        <path
          d="M36 18.5 H31.5 A2.5 2.5 0 0 0 31.5 23.5 H34 A2.5 2.5 0 0 1 34 28.5 H29.5 M33 16 V31"
          fill="none"
          stroke="var(--primary-foreground)"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </motion.g>
    </svg>
  )
}
