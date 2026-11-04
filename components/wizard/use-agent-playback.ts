'use client'

import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import { agentStageDelay } from '@/lib/agent-pacing'

export type ActivityEvent = { stage: number; detail: string }

export function useAgentPlayback(
  received: ActivityEvent[],
  ready: boolean,
  onDone: () => void,
  onProgress: (stage: number) => void,
  paused = false,
) {
  const [shown, setShown] = useState(1)
  const began = useRef<number | null>(null)
  const completed = useRef(false)
  const reduced = useReducedMotion()
  const callbacks = useRef({ onDone, onProgress })
  callbacks.current = { onDone, onProgress }
  const events = received.slice(0, shown)
  const active = events.at(-1)!.stage

  useEffect(() => {
    callbacks.current.onProgress([0, 2, 4, 5][active])
  }, [active])

  useEffect(() => {
    if (began.current === null) began.current = performance.now()
    if (completed.current || paused) return
    const next = received[shown]
    // Retries and detail updates in the same stage do not each incur a delay.
    if (next?.stage === active) {
      setShown((value) => value + 1)
      return
    }
    if (!next && !ready) return
    const timer = setTimeout(
      () => {
        if (next) {
          began.current = performance.now()
          setShown((value) => value + 1)
        } else {
          completed.current = true
          callbacks.current.onDone()
        }
      },
      agentStageDelay(performance.now() - began.current, !!reduced),
    )
    return () => clearTimeout(timer)
  }, [received, shown, ready, active, paused, reduced])

  return events
}
