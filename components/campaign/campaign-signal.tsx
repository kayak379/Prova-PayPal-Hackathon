'use client'

import { motion, useReducedMotion } from 'motion/react'

export function CampaignSignal() {
  const reduced = useReducedMotion()
  return (
    <svg
      viewBox="0 0 112 64"
      className="h-16 w-28 shrink-0 text-brand"
      aria-hidden="true"
    >
      {[18, 28].map((r, i) => (
        <motion.circle
          key={r}
          cx="56"
          cy="32"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeOpacity=".2"
          initial={false}
          animate={reduced ? {} : { opacity: [0.3, 0.8, 0.3] }}
          transition={{ duration: 3, delay: i * 0.4, repeat: 1 }}
        />
      ))}
      {[
        [12, 18],
        [100, 18],
        [20, 53],
        [92, 53],
      ].map(([x, y], i) => (
        <g key={i}>
          <motion.path
            d={`M56 32 L${x} ${y}`}
            stroke="currentColor"
            strokeOpacity=".3"
            strokeDasharray="2 4"
            initial={reduced ? false : { pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: i * 0.15 }}
          />
          <motion.circle
            cx={x}
            cy={y}
            r="3"
            fill="currentColor"
            initial={reduced ? false : { opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.4 + i * 0.15 }}
          />
        </g>
      ))}
      <circle cx="56" cy="32" r="8" fill="var(--brand-soft)" />
      <circle cx="56" cy="32" r="4" fill="currentColor" />
    </svg>
  )
}
