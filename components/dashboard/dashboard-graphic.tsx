'use client'

import { motion, useReducedMotion } from 'motion/react'

export function DashboardGraphic() {
  const reduced = useReducedMotion()
  return (
    <div className="relative flex min-h-44 items-center justify-center overflow-hidden rounded-2xl bg-primary px-5 py-3 text-primary-foreground">
      <svg
        viewBox="0 0 264 144"
        className="h-36 w-full max-w-72"
        aria-hidden="true"
      >
        {[42, 60].map((r) => (
          <circle
            key={r}
            cx="132"
            cy="69"
            r={r}
            fill="none"
            stroke="currentColor"
            strokeOpacity=".1"
          />
        ))}
        <motion.path
          d="M44 94 C60 94 60 44 90 44 H179 C204 44 197 99 221 99"
          fill="none"
          stroke="#dce9d8"
          strokeOpacity=".5"
          strokeDasharray="3 6"
          initial={reduced ? false : { pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1.5 }}
        />
        <motion.g
          initial={reduced ? false : { y: 10, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
        >
          <path d="M89 66 L132 44 175 66 132 88 Z" fill="#dce9d8" />
          <path d="M89 66 V103 L132 125 V88 Z" fill="#a9c4a9" />
          <path d="M132 88 L175 66 V103 L132 125 Z" fill="#7c9f82" />
          <path
            d="M111 55 L154 77 V91"
            fill="none"
            stroke="var(--primary)"
            strokeOpacity=".45"
            strokeWidth="6"
          />
          <path
            d="M99 84 L117 93 M99 91 L111 97"
            stroke="var(--primary)"
            strokeOpacity=".4"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </motion.g>
        <motion.g
          initial={false}
          animate={reduced ? {} : { y: [0, -5, 0] }}
          transition={{ duration: 4, repeat: 2, ease: 'easeInOut' }}
        >
          <circle cx="197" cy="33" r="19" fill="#ffc439" />
          <path
            d="M202 26 H194 A4 4 0 0 0 194 34 H199 A4 4 0 0 1 199 42 H191 M197 22 V46"
            fill="none"
            stroke="var(--primary)"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </motion.g>
        <motion.g
          initial={reduced ? false : { scale: 0.7, opacity: 0 }}
          whileInView={{ scale: 1, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: reduced ? 0 : 0.5, duration: 0.6 }}
        >
          <rect x="24" y="75" width="31" height="38" rx="6" fill="#dce9d8" />
          <path
            d="M32 85 H47 M32 92 H47 M32 99 H41"
            stroke="var(--primary)"
            strokeOpacity=".5"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </motion.g>
        <circle cx="220" cy="99" r="4" fill="#dce9d8" />
        <circle cx="68" cy="30" r="3" fill="#dce9d8" opacity=".5" />
      </svg>
    </div>
  )
}
