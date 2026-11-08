import type { DisasterProvenance } from '@/lib/types'

export function DisasterContext({ disaster }: { disaster: DisasterProvenance }) {
  const { event, assumptions } = disaster
  return <aside className="mt-5 rounded-2xl border border-border bg-card p-5" aria-label="Disaster response context">
    <p className="text-xs font-medium text-brand">Proactive disaster response</p>
    <h2 className="mt-1 font-medium">{event.title}</h2>
    <p className="mt-2 text-sm text-muted-foreground">{disaster.summary}</p>
    <p className="mt-2 text-xs text-muted-foreground">
      {event.sourceUrl ? <a href={event.sourceUrl} target="_blank" rel="noreferrer" className="underline">{event.source}</a> : event.source}
      {' · '}{new Date(event.occurredAt).toLocaleString()} · {disaster.distanceMiles.toFixed(1)} miles from the shipping address
    </p>
    <p className="mt-2 text-xs text-muted-foreground">Planning assumptions: {assumptions.proactive.people} people for {assumptions.proactive.days} days. Population and duration are organization defaults, not confirmed disaster impact. Delivery availability remains unverified.</p>
  </aside>
}
