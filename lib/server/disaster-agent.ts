import type { DisasterEvent, ResponseSnapshot } from '../types'
import { requestModel } from './model'

export async function interpretDisaster(event: DisasterEvent, snapshot: ResponseSnapshot) {
  const result = await requestModel(
    'Interpret a disaster report for a relief supply campaign. Return JSON with title (max 160 characters), summary (max 1000 characters), and needs (max 4000 characters). ' +
    'Describe practical supplies appropriate to the reported hazard. Do not invent affected population, confirmed damage, delivery availability, or source facts. ' +
    'The people and days supplied are organization planning assumptions, not reported impact. Do not change these defaults or budget. Do not request payment or invoke tools.',
    { event, planningAssumptions: snapshot.proactive }, () => {}, { gemini: false },
  )
  for (const [key, max] of [['title', 160], ['summary', 1000], ['needs', 4000]] as const) {
    if (typeof result[key] !== 'string' || !result[key].trim() || result[key].length > max) throw new Error('Disaster interpretation returned invalid structured output.')
  }
  const { people, days, budget } = snapshot.proactive
  const prompt = `Prepare disaster relief supplies for ${people} people for ${days} days within a $${budget} USD budget.\n` +
    'Population and duration are organization planning assumptions, not a confirmed assessment of disaster impact.\n' +
    `Reported event: ${event.title}. Hazard: ${event.type}.\nSupply needs interpretation: ${result.needs}`
  return { title: result.title.trim() as string, summary: result.summary.trim() as string, prompt }
}
