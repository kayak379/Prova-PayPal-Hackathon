'use client'

import { motion, useReducedMotion } from 'motion/react'

export function PurchasesGraphic() {
  const reduced = useReducedMotion()
  return (
    <svg
      viewBox="0 0 88 64"
      className="h-16 w-[88px] shrink-0 text-brand"
      aria-hidden="true"
    >
      <ellipse
        cx="44"
        cy="54"
        rx="27"
        ry="4"
        fill="currentColor"
        opacity=".08"
      />
      <motion.g
        initial={reduced ? false : { y: -8, opacity: 0 }}
        whileInView={{ y: 0, opacity: 1 }}
        viewport={{ once: true }}
        transition={{ type: 'spring', stiffness: 110, damping: 12 }}
      >
        <path
          d="M20 24 L44 12 68 24 44 37 Z"
          fill="var(--brand-soft)"
          stroke="currentColor"
          strokeOpacity=".5"
          strokeLinejoin="round"
        />
        <path
          d="M20 24 V44 L44 56 68 44 V24 L44 37 Z"
          fill="var(--card)"
          stroke="currentColor"
          strokeOpacity=".5"
          strokeLinejoin="round"
        />
        <path
          d="M44 37 V56 M32 18 L56 30 V38"
          fill="none"
          stroke="currentColor"
          strokeOpacity=".4"
        />
        <motion.path
          d="M26 34 L35 38 M26 39 L32 42"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          initial={reduced ? false : { pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
        />
      </motion.g>
      <motion.path
        d="M71 8 V16 M67 12 H75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        initial={reduced ? false : { opacity: 0, scale: 0.5 }}
        whileInView={{ opacity: [0.3, 1, 0.3], scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: reduced ? 0 : 2 }}
      />
    </svg>
  )
}
