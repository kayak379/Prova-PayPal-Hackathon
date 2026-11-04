'use client'

import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from 'motion/react'
import { Settings } from 'lucide-react'
import { useId } from 'react'
import { cn } from '@/lib/utils'

export function AgentGlyph({
  stage,
  active,
  progress,
  className,
}: {
  stage: number
  active: boolean
  progress?: MotionValue<number>
  className?: string
}) {
  const reduced = useReducedMotion()
  const clipId = useId()
  const still = useMotionValue(1)
  const cycle = progress ?? still
  const moving = active && !reduced
  const draw = useTransform(cycle, [0, 0.28, 0.6, 0.85, 1], [0, 0, 1, 1, 0])
  const shieldDraw = useTransform(
    cycle,
    [0, 0.12, 0.38, 0.85, 1],
    [0, 0.4, 1, 1, 0],
  )
  const shieldTilt = useTransform(
    cycle,
    [0, 0.2, 0.48, 0.85, 1],
    [-6, 0, 0, 0, -6],
  )
  const searchX = useTransform(cycle, [0, 0.48, 1], [-4, 3, -4])
  const searchY = useTransform(cycle, [0, 0.48, 1], [3, -3, 3])
  const gearRotation = useTransform(cycle, [0, 1], [0, 360])
  const verticalWrap = useTransform(
    cycle,
    [0, 0.08, 0.34, 0.94, 1],
    [0, 0, 1, 1, 0],
  )
  const horizontalWrap = useTransform(
    cycle,
    [0, 0.2, 0.5, 0.94, 1],
    [0, 0, 1, 1, 0],
  )
  const leftBow = useTransform(cycle, [0, 0.4, 0.67, 0.94, 1], [0, 0, 1, 1, 0])
  const rightBow = useTransform(cycle, [0, 0.5, 0.77, 0.94, 1], [0, 0, 1, 1, 0])
  const ribbonTails = useTransform(
    cycle,
    [0, 0.7, 0.87, 0.94, 1],
    [0, 0, 1, 1, 0],
  )
  const knotTension = useTransform(
    cycle,
    [0, 0.5, 0.75, 0.88, 1],
    [0.8, 0.8, 1.12, 1, 1],
  )
  return (
    <svg
      viewBox="0 0 64 64"
      className={cn(active ? 'text-brand-foreground' : 'text-brand', className)}
      aria-hidden="true"
    >
      <defs>
        <clipPath id={clipId}>
          <circle cx="32" cy="32" r="28" />
        </clipPath>
      </defs>
      <circle
        cx="32"
        cy="32"
        r="29"
        fill={active ? 'var(--brand)' : 'var(--brand-soft)'}
      />
      <g clipPath={`url(#${clipId})`}>
        <g transform="translate(6 6) scale(.8125)">
          <AnimatePresence mode="wait" initial={false}>
            <motion.g
              key={stage}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {stage === 0 && (
                <motion.g
                  style={{
                    rotate: moving ? gearRotation : 0,
                    transformOrigin: '32px 32px',
                    transformBox: 'view-box',
                  }}
                >
                  <Settings
                    x="13"
                    y="13"
                    width="38"
                    height="38"
                    strokeWidth="1.7"
                  />
                </motion.g>
              )}
              {stage === 1 && (
                <g>
                  <path
                    d="M17 32 L28 26 39 32 28 38 Z M17 32 V43 L28 49 39 43 V32 M28 38 V49"
                    strokeOpacity=".65"
                  />
                  <motion.g
                    style={{ x: moving ? searchX : 0, y: moving ? searchY : 0 }}
                  >
                    <circle
                      cx="42"
                      cy="22"
                      r="9"
                      fill={active ? 'var(--brand)' : 'var(--card)'}
                    />
                    <path d="M48.5 28.5 L55 35" strokeWidth="3" />
                    <path
                      d="M38 22 H46 M42 18 V26"
                      strokeOpacity=".5"
                      strokeWidth="1.5"
                    />
                  </motion.g>
                </g>
              )}
              {stage === 2 && (
                <g>
                  <rect
                    x="16"
                    y="23"
                    width="32"
                    height="29"
                    rx="3"
                    fill={
                      active ? 'var(--brand-foreground)' : 'var(--brand-soft)'
                    }
                  />
                  <path d="M19 27 H45" strokeOpacity=".16" />
                  <g
                    stroke={active ? 'var(--brand)' : 'currentColor'}
                    strokeWidth="4"
                  >
                    <motion.path
                      d="M32 52 V23"
                      style={{ pathLength: moving ? verticalWrap : 1 }}
                    />
                    <motion.path
                      d="M16 36 H48"
                      style={{ pathLength: moving ? horizontalWrap : 1 }}
                    />
                  </g>
                  <motion.g
                    style={{
                      scaleX: moving ? knotTension : 1,
                      transformOrigin: '32px 22px',
                      transformBox: 'view-box',
                    }}
                    strokeWidth="2.5"
                  >
                    <motion.path
                      d="M32 23 C24 23 18 17 22 13 C27 9 32 16 32 23"
                      style={{ pathLength: moving ? leftBow : 1 }}
                    />
                    <motion.path
                      d="M32 23 C40 23 46 17 42 13 C37 9 32 16 32 23"
                      style={{ pathLength: moving ? rightBow : 1 }}
                    />
                    <motion.path
                      d="M32 22 L25 30 M32 22 L39 30"
                      stroke={active ? 'var(--brand)' : 'currentColor'}
                      style={{ pathLength: moving ? ribbonTails : 1 }}
                    />
                  </motion.g>
                </g>
              )}
              {stage === 3 && (
                <motion.g
                  style={{
                    rotate: moving ? shieldTilt : 0,
                    transformOrigin: '32px 32px',
                    transformBox: 'view-box',
                  }}
                >
                  <path
                    d="M32 7 L52 15 L49 36 Q45 48 32 56 Q19 48 15 36 L12 15 Z"
                    strokeOpacity=".18"
                  />
                  <motion.path
                    d="M32 7 L52 15 L49 36 Q45 48 32 56 Q19 48 15 36 L12 15 Z"
                    strokeWidth="2.5"
                    style={{ pathLength: moving ? shieldDraw : 1 }}
                  />
                  <motion.path
                    d="M21 32 L29 40 44 24"
                    strokeWidth="3"
                    style={{ pathLength: moving ? draw : 1 }}
                  />
                </motion.g>
              )}
            </motion.g>
          </AnimatePresence>
        </g>
      </g>
    </svg>
  )
}
