'use client'

import { motion, useReducedMotion } from 'motion/react'

export function FundingGraphic() {
  const reduced = useReducedMotion()
  return (
    <svg
      viewBox="0 0 80 64"
      className="mb-3 h-16 w-20 text-brand"
      aria-hidden="true"
    >
      <circle cx="40" cy="32" r="28" fill="var(--brand-soft)" />
      <motion.g
        initial={reduced ? false : { y: 5, opacity: 0 }}
        whileInView={{ y: 0, opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
      >
        <rect
          x="24"
          y="9"
          width="32"
          height="44"
          rx="5"
          fill="var(--card)"
          stroke="currentColor"
          strokeOpacity=".3"
        />
        {[20, 28, 36].map((y, i) => (
          <motion.path
            key={y}
            d={`M31 ${y} h${i === 2 ? 10 : 18}`}
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeOpacity=".5"
            initial={reduced ? false : { pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 + i * 0.15 }}
          />
        ))}
        {!reduced &&
          [20, 28, 36].map((y, i) => (
            <motion.path
              key={`shimmer-${y}`}
              d={`M31 ${y} h${i === 2 ? 10 : 18}`}
              stroke="var(--card)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray="4 40"
              initial={{ opacity: 0, strokeDashoffset: 8 }}
              animate={{ opacity: [0, 0.9, 0], strokeDashoffset: [8, -24] }}
              transition={{
                delay: 2 + i * 0.12,
                duration: 1.1,
                repeat: Infinity,
                repeatDelay: 5,
              }}
            />
          ))}
        <motion.circle
          cx="55"
          cy="46"
          r="10"
          fill="var(--primary)"
          initial={reduced ? false : { scale: 0 }}
          whileInView={{ scale: 1 }}
          viewport={{ once: true }}
          transition={{ type: 'spring', delay: reduced ? 0 : 0.8 }}
        />
        <motion.path
          d="M51 46 l3 3 5-6"
          fill="none"
          stroke="var(--primary-foreground)"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={reduced ? false : { opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: reduced ? 0 : 1 }}
        />
      </motion.g>
    </svg>
  )
}
