export const AGENT_CYCLE_MS = 2800
export const AGENT_SETTLE_MS = 200

// Leave after a complete animation cycle, including when the backend is slow.
export function agentStageDelay(elapsed: number, reducedMotion = false) {
  if (reducedMotion) return Math.max(0, 1500 - elapsed)
  const earliest = Math.max(elapsed, AGENT_SETTLE_MS + AGENT_CYCLE_MS)
  const cycles = Math.ceil((earliest - AGENT_SETTLE_MS) / AGENT_CYCLE_MS - 1e-9)
  return Math.max(0, AGENT_SETTLE_MS + cycles * AGENT_CYCLE_MS - elapsed)
}
