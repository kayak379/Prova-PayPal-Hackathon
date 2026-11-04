'use client'

import { useState } from 'react'
import { Logo } from '../brand'
import { Pressable } from '../kit'
import { AgentActivityView, type ActivityEvent } from './agent-activity'
import { StepGraphic } from './step-graphic'
import { useAgentPlayback } from './use-agent-playback'

const EVENTS: ActivityEvent[] = [
  { stage: 0, detail: 'Identifying priority supplies' },
  { stage: 1, detail: 'Searching Channel3 for 4 supply categories' },
  {
    stage: 1,
    detail: 'Looking for priced products from bulk and industrial suppliers.',
  },
  { stage: 2, detail: 'Comparing 24 products and allocating the budget' },
  { stage: 3, detail: 'Validating prices and preparing your proposal' },
]

export function AgentFlowPreview() {
  const [replay, setReplay] = useState(0)
  return (
    <AgentFlowPreviewRun
      key={replay}
      onReplay={() => setReplay((value) => value + 1)}
    />
  )
}

function AgentFlowPreviewRun({ onReplay }: { onReplay: () => void }) {
  const [playing, setPlaying] = useState(true)
  const [finished, setFinished] = useState(false)
  // All events and the result are ready immediately: exercise the same fast-backend
  // playback queue used by the real campaign flow, without any API requests.
  const events = useAgentPlayback(
    EVENTS,
    true,
    () => setFinished(true),
    () => {},
    !playing,
  )
  const active = events[events.length - 1].stage
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 px-5 backdrop-blur-md">
        <div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-3 py-3">
          <Logo href="/dashboard" />
          <span className="text-xs text-muted-foreground">
            Design preview · Instant backend simulation · No API calls
          </span>
          <div className="flex gap-2">
            <Pressable
              variant="ghost"
              size="sm"
              disabled={finished}
              onClick={() => setPlaying((value) => !value)}
            >
              {finished ? 'Finished' : playing ? 'Pause' : 'Play'}
            </Pressable>
            <Pressable variant="secondary" size="sm" onClick={onReplay}>
              Replay
            </Pressable>
          </div>
        </div>
      </header>
      <main className="mx-auto grid max-w-6xl gap-6 px-5 py-6 lg:grid-cols-[340px_1fr] lg:gap-10 lg:py-10">
        <aside className="lg:h-[calc(100dvh-8.5rem)]">
          <StepGraphic
            step={1}
            agentProgress={[0, 2, 4, 5][active]}
            draft={{
              name: 'Wildfire response',
              budget: 10000,
              folderId: '',
              taxId: '',
              address: '',
            }}
            plan={null}
            paying={false}
            paymentComplete={false}
          />
        </aside>
        <section className="min-w-0">
          <AgentActivityView
            events={events}
            prompt="Wildfire evacuation center, 600 people, heavy smoke. Masks, water and blankets."
            budget={10000}
          />
        </section>
      </main>
    </div>
  )
}
