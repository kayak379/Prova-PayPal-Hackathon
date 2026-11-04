'use client'

import { motion, useReducedMotion } from 'motion/react'

const REST = 'M10 20 C20 20 38 20 50 20 L50 41 C38 41 20 41 10 41 Z'
const LIFT = 'M10 20 C20 22 38 13 50 17 L50 38 C38 34 20 43 10 41 Z'
const DIP = 'M10 20 C20 19 38 24 50 22 L50 43 C38 45 20 40 10 41 Z'

export function FinanceMoney({ active }: { active: boolean }) {
  const reduced = useReducedMotion()
  const flutter = {
    duration: active ? 2.6 : 4,
    times: [0, 0.34, 0.52, 0.7, 1],
    ease: 'easeInOut' as const,
    repeat: reduced ? 0 : Infinity,
  }

  return (
    <svg
      viewBox="0 0 64 64"
      className="size-14 shrink-0 text-brand"
      aria-hidden="true"
    >
      <circle cx="32" cy="32" r="29" fill="var(--brand-soft)" />
      {[2, 1].map((layer) => (
        <g key={layer} transform={`translate(${layer * 1.5} ${layer * 4})`}>
          <motion.path
            d={REST}
            initial={false}
            animate={{ d: reduced ? REST : [REST, LIFT, DIP, REST, REST] }}
            transition={{
              ...flutter,
              times: [0, 0.34 + layer * 0.035, 0.52 + layer * 0.035, 0.7 + layer * 0.035, 1],
            }}
            fill="var(--card)"
            stroke="currentColor"
            strokeOpacity={layer === 2 ? 0.55 : 0.8}
            strokeLinejoin="round"
          />
        </g>
      ))}
      <motion.path
        d={REST}
        initial={false}
        animate={{ d: reduced ? REST : [REST, LIFT, DIP, REST, REST] }}
        transition={flutter}
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <motion.g
        initial={false}
        animate={{ y: reduced ? 0 : [0, -2, 1.5, 0, 0] }}
        transition={flutter}
        fill="none"
        stroke="var(--brand-foreground)"
        strokeLinecap="round"
      >
        <ellipse cx="30" cy="30.5" rx="7" ry="8" strokeOpacity=".45" />
        <path
          d="M33 27 H29 A1.75 1.75 0 0 0 29 30.5 H31 A1.75 1.75 0 0 1 31 34 H27 M30 25 V36"
          strokeWidth="1.4"
        />
        <path
          d="M15 28 V25 H19 M41 36 H45 V33"
          strokeOpacity=".55"
          strokeWidth="1.2"
        />
      </motion.g>
    </svg>
  )
}
