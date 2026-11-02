'use client'

import { MotionConfig } from 'motion/react'

export const spring = { type: 'spring', stiffness: 420, damping: 36, mass: 0.8 } as const
export const softSpring = { type: 'spring', stiffness: 260, damping: 30 } as const

export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={spring}>
      {children}
    </MotionConfig>
  )
}
