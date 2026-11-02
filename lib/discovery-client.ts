import type { Plan } from './types'
export async function requestPlan(input: { prompt: string; budget: number; feedback?: string; currentPlan?: Plan }, progress: (stage: number, detail: string) => void = () => {}): Promise<Plan> {
 const response = await fetch('/api/discovery', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
 if (!response.ok || !response.body) throw new Error('Discovery request failed. Please retry.')
 const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ''; let plan: Plan | undefined
 while (true) {
  const { value, done } = await reader.read(); buffer += decoder.decode(value, { stream: !done })
  const lines = buffer.split('\n'); buffer = lines.pop() || ''
  for (const line of lines) { if (!line.trim()) continue; const event = JSON.parse(line); if (event.error) throw new Error(event.error); if (event.plan) plan = event.plan; if (typeof event.stage === 'number') progress(event.stage, event.detail) }
  if (done) break
 }
 if (!plan) throw new Error('Discovery ended without a proposal. Please retry.')
 return plan
}
