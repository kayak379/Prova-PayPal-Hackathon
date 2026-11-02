'use client'

import { motion, useReducedMotion } from 'motion/react'

const STAGES = [
  { x: 38, label: 'Request', number: '01' },
  { x: 132, label: 'Source', number: '02' },
  { x: 226, label: 'Purchase', number: '03' },
]

export function DashboardGraphic() {
  const reduced = useReducedMotion()
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.65, ease: 'easeOut' }}
      className="relative flex min-h-60 items-center justify-center overflow-hidden rounded-2xl bg-primary px-5 py-4 text-primary-foreground"
    >
      <svg
        viewBox="0 0 264 144"
        className="h-56 w-full max-w-xl"
        role="img"
        aria-label="Campaign flow: describe your request, source supplies, then purchase them."
      >
        {[0, 1].map((i) => (
          <g key={i}>
            <path
              d={`M${66 + i * 94} 62 h37 m-5 -4 5 4 -5 4`}
              fill="none"
              stroke="#dce9d8"
              strokeOpacity=".35"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {!reduced && (
              <motion.circle
                cy="62"
                r="3.5"
                fill="#dce9d8"
                initial={{ cx: 66 + i * 94, opacity: 0 }}
                animate={{
                  cx: [66 + i * 94, 103 + i * 94],
                  opacity: [0, 1, 1, 0],
                }}
                transition={{
                  delay: 1.2 + i * 1.4,
                  duration: 1.4,
                  repeat: Infinity,
                  repeatDelay: 5.8,
                  ease: 'easeInOut',
                }}
              />
            )}
          </g>
        ))}
        {STAGES.map((stage, i) => (
          <g key={stage.label}>
            <motion.circle
              cx={stage.x}
              cy="62"
              r="28"
              fill="none"
              stroke="#dce9d8"
              strokeWidth="1.5"
              initial={{ opacity: reduced ? 0.2 : 0 }}
              animate={reduced ? { opacity: 0.2 } : { opacity: [0, 1, 0] }}
              transition={{
                delay: 0.6 + i * 1.4,
                duration: 1.8,
                repeat: Infinity,
                repeatDelay: 5.4,
              }}
            />
            <circle
              cx={stage.x}
              cy="62"
              r="23"
              fill={i === 2 ? '#ffc439' : '#dce9d8'}
            />
            <text
              x={stage.x}
              y="18"
              textAnchor="middle"
              fill="#dce9d8"
              opacity=".55"
              fontSize="9"
              fontFamily="inherit"
            >
              {stage.number}
            </text>
            <text
              x={stage.x}
              y="108"
              textAnchor="middle"
              fill="#dce9d8"
              fontSize="12"
              fontWeight="500"
              fontFamily="inherit"
            >
              {stage.label}
            </text>
          </g>
        ))}
        <g
          fill="none"
          stroke="var(--primary)"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="29" y="49" width="18" height="25" rx="3" />
          <path d="M34 56 h8 M34 61 h8 M34 66 h5" />
          <path d="M119 56 132 49 145 56 132 63 Z M119 56 V70 L132 77 145 70 V56 M132 63 V77 M125 52 138 59 V65" />
          <rect x="212" y="52" width="28" height="20" rx="3" />
          <path d="M212 58 H240 M217 66 h6" />
        </g>
        <text
          x="132"
          y="131"
          textAnchor="middle"
          fill="#dce9d8"
          opacity=".5"
          fontSize="9"
          fontFamily="inherit"
        >
          From need to supplies
        </text>
      </svg>
    </motion.div>
  )
}
