'use client'

import { useEffect, useRef, useState } from 'react'
import { Radio, Settings } from 'lucide-react'
import { ProactiveSettingsDialog } from './proactive-settings-dialog'
import { LocationGlobe } from './location-globe'
import { Pressable, PressableLink } from '../kit'
import { useStore } from '@/lib/store'
import { usd } from '@/lib/format'
import type { ProactiveResponse } from '@/lib/types'

export function ProactiveResponses() {
  const { settings, refresh } = useStore()
  const [responses, setResponses] = useState<ProactiveResponse[]>([])
  const [error, setError] = useState('')
  const [retrying, setRetrying] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const ready = useRef(new Set<string>())

  useEffect(() => {
    let cancelled = false
    let polling = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const controller = new AbortController()
    async function poll() {
      if (document.hidden || cancelled || polling) return
      polling = true
      try {
        const response = await fetch('/api/disasters', { cache: 'no-store', signal: controller.signal })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Could not load proactive responses.')
        if (cancelled) return
        const next: ProactiveResponse[] = data.responses
        const newReady = next.filter(r => r.status === 'ready' && !ready.current.has(r.id))
        if (newReady.length) {
          await refresh()
          newReady.forEach(r => ready.current.add(r.id))
        }
        if (!cancelled) { setResponses(next); setError('') }
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load responses.') }
      finally {
        polling = false
        if (!cancelled && !document.hidden) { clearTimeout(timer); timer = setTimeout(poll, 3000) }
      }
    }
    function visibility() {
      clearTimeout(timer)
      if (!document.hidden) void poll()
    }
    void poll()
    document.addEventListener('visibilitychange', visibility)
    return () => { cancelled = true; clearTimeout(timer); controller.abort(); document.removeEventListener('visibilitychange', visibility) }
  }, [refresh])

  async function retry(id: string) {
    setRetrying(id)
    try {
      const response = await fetch('/api/disasters', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Retry failed.')
      setResponses(rows => rows.map(r => r.id === id ? { ...r, status: 'queued', error: undefined, progress: 'Waiting for response worker' } : r))
      setError('')
    } catch (e) { setError(e instanceof Error ? e.message : 'Retry failed.') }
    finally { setRetrying(null) }
  }

  return <section aria-labelledby="proactive-heading" className="mt-8 rounded-2xl border border-border bg-card p-5 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="proactive-heading" className="flex items-center gap-2 font-serif text-2xl"><Radio className="size-5 text-brand" /> Proactive responses</h2>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">{settings.proactive?.enabled ? `Watching within ${settings.proactive.radiusMiles} miles` : 'Automatic preparation off'}</span>
        <Pressable type="button" variant="ghost" size="icon" aria-label="Proactive response settings" title="Proactive response settings" onClick={() => setSettingsOpen(true)}><Settings /></Pressable>
      </div>
    </div>
    <ProactiveSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    <div className="mt-4 flex items-center gap-5 sm:gap-8">
      <LocationGlobe location={settings.shippingLocation?.address === settings.address ? settings.shippingLocation : undefined} />
      <div className="min-w-0 max-w-lg">
        <p className="text-sm leading-relaxed text-muted-foreground">{settings.proactive?.enabled ? 'Nearby disaster updates will appear here as Prova prepares supply plans for your review.' : 'Use the settings gear above to enable automatic responses to nearby disasters.'}</p>
        {settings.address && <p className="mt-2 truncate text-xs text-muted-foreground/75" title={settings.address}>{settings.address}</p>}
      </div>
    </div>
    <div className="mt-4 space-y-3" aria-live="polite">
      {responses.map(response => <article key={response.id} className="rounded-xl border border-border p-4">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-brand">{response.mock ? 'Demo proposal' : response.status === 'ready' ? response.total === undefined ? 'Campaign created' : 'Ready for review' : response.status === 'failed' || response.status === 'cancelled' ? 'Needs attention' : 'Preparing response'}</p>
            <h3 className="mt-1 break-words font-medium">{response.event.title}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {response.event.sourceUrl ? <a className="underline" href={response.event.sourceUrl} target="_blank" rel="noreferrer">{response.event.source}</a> : response.event.source}
              {' · '}{new Date(response.event.occurredAt).toLocaleString()}
              {response.distanceMiles !== undefined && ` · ${response.distanceMiles.toFixed(1)} miles away`}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">{response.progress}</p>
            {response.snapshot && <p className="mt-1 text-xs text-muted-foreground">Planning assumption: {response.snapshot.proactive.people} people for {response.snapshot.proactive.days} days · {usd(response.snapshot.proactive.budget)} ceiling{response.total !== undefined && ` · ${usd(response.total)} estimated`}</p>}
            {response.mock && <p className="mt-2 text-xs text-muted-foreground">Products and prices are mock data. Live discovery was unavailable.</p>}
            {response.error && <p className="mt-2 text-sm text-destructive">{response.error}</p>}
          </div>
          {response.status === 'ready' && response.campaignId && <PressableLink className="w-full shrink-0 sm:w-auto" href={response.total === undefined ? `/campaigns/${response.campaignId}` : `/campaigns/new?campaign=${response.campaignId}`} variant="secondary">{response.total === undefined ? 'View campaign' : 'Review supplies'}</PressableLink>}
          {['failed', 'cancelled'].includes(response.status) && <Pressable className="w-full shrink-0 sm:w-auto" variant="secondary" disabled={retrying === response.id} onClick={() => retry(response.id)}>{retrying === response.id ? 'Retrying…' : 'Retry response'}</Pressable>}
        </div>
      </article>)}
    </div>
  </section>
}
