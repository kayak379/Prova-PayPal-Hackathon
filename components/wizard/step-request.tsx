'use client'

import { AnimatePresence, motion } from 'motion/react'
import { FileSpreadsheet, Paperclip, Sparkles, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { Pressable } from '../kit'
import { AgentActivity } from './agent-activity'
import { usd } from '@/lib/format'
import type { Plan } from '@/lib/types'

const EXAMPLES = [
  'Category 4 hurricane, 2,000 displaced families in Houston. Need water, shelter and first aid for 3 days.',
  'Wildfire evacuation center, 600 people, heavy smoke. Masks, water and blankets.',
  'Flooding in a rural county, 400 households without power for a week.',
]

export function StepRequest({
  prompt,
  setPrompt,
  csv,
  setCsv,
  budget,
  campaignName,
  onPlan,
  onProgress,
}: {
  prompt: string
  setPrompt: (s: string) => void
  csv: { name: string; rows: number } | null
  setCsv: (c: { name: string; rows: number } | null) => void
  budget: number
  campaignName: string
  onPlan: (p: Plan) => void
  onProgress: (n: number) => void
}) {
  const [error, setError] = useState('')
  const [thinking, setThinking] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const onFile = async (file: File) => {
    const text = await file.text()
    const rows = Math.max(0, text.trim().split(/\r?\n/).length - 1)
    setCsv({ name: file.name, rows })
    setPrompt(`${prompt}\nSupplies list (${file.name}):\n${text.slice(0, 8000)}`)
  }

  const canBuild = prompt.trim().length > 8 || !!csv

  if (thinking) {
    return (
      <AgentActivity
        prompt={prompt || `Supplies list from ${csv?.name}`}
        budget={budget}
        onProgress={onProgress}
        onError={(message) => { setError(message); setThinking(false); onProgress(-1) }}
        onDone={(p) => {
          onProgress(-1)
          onPlan(p)
        }}
      />
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <p role="alert" className="text-destructive">{error}</p>}
      <div>
        <h1 className="text-balance font-serif text-4xl tracking-tight sm:text-5xl">What happened?</h1>
        {campaignName && <p className="mt-2 text-muted-foreground">{campaignName}</p>}
      </div>

      <motion.div
        layout
        className="rounded-3xl border border-border bg-card p-2 shadow-[0_8px_30px_-12px_rgba(15,20,30,0.12)] transition-[border-color,box-shadow] focus-within:border-brand focus-within:shadow-[0_0_0_4px_var(--brand-soft)]"
      >
        <label htmlFor="req" className="sr-only">
          Describe the disaster and what supplies you need
        </label>
        <textarea
          id="req"
          autoFocus
          rows={5}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the disaster, how many people are affected, and what they need…"
          className="block w-full resize-none bg-transparent px-4 pt-3 text-lg leading-relaxed outline-none placeholder:text-muted-foreground/60"
        />

        <AnimatePresence>
          {csv && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="px-2"
            >
              <div className="mt-2 inline-flex items-center gap-2.5 rounded-xl bg-muted py-2 pl-3 pr-1.5 text-sm">
                <FileSpreadsheet className="size-4 text-success" />
                <span className="font-medium">{csv.name}</span>
                <span className="text-muted-foreground tabular">{csv.rows} rows</span>
                <button
                  onClick={() => setCsv(null)}
                  aria-label="Remove file"
                  className="inline-flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-2 flex items-center justify-between gap-2 p-1">
          <div className="flex items-center gap-1">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              tabIndex={-1}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) onFile(f)
                e.target.value = ''
              }}
            />
            <Pressable variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>
              <Paperclip /> CSV
            </Pressable>
            <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground tabular">{usd(budget)} budget</span>
          </div>
          <Pressable variant="brand" disabled={!canBuild} onClick={() => { setError(''); setThinking(true) }}>
            <Sparkles /> Build proposal
          </Pressable>
        </div>
      </motion.div>

      <div className="flex flex-col gap-2">
        {EXAMPLES.map((ex, i) => (
          <motion.button
            key={ex}
            type="button"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0, transition: { delay: 0.15 + i * 0.05 } }}
            whileTap={{ scale: 0.99 }}
            onClick={() => setPrompt(ex)}
            className="rounded-2xl border border-transparent px-4 py-3 text-left text-sm text-muted-foreground outline-none transition-colors hover:border-border hover:bg-card hover:text-foreground focus-visible:border-border focus-visible:bg-card"
          >
            {ex}
          </motion.button>
        ))}
      </div>
    </div>
  )
}
