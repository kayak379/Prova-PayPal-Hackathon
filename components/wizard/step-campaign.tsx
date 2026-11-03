'use client'

import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, Check, Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { inputClass, Label, Pressable } from '../kit'
import { spring } from '../motion-provider'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import type { Draft } from './campaign-wizard'

const PRESETS = [5000, 10000, 25000, 50000]

export function StepCampaign({
  draft,
  setDraft,
  onNext,
}: {
  draft: Draft
  setDraft: React.Dispatch<React.SetStateAction<Draft>>
  onNext: () => void
}) {
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const valid = draft.name.trim().length > 0 && draft.budget > 0 && !!draft.folderId

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) onNext()
      }}
      className="flex flex-col gap-9"
    >
      <div>
        <label htmlFor="c-name" className="sr-only">
          Campaign name
        </label>
        <input
          id="c-name"
          autoFocus
          value={draft.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="Name this campaign"
          className="w-full border-b border-border bg-transparent pb-3 font-serif text-4xl tracking-tight outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground sm:text-5xl"
        />
      </div>

      <FolderPicker value={draft.folderId} onChange={(id) => set('folderId', id)} />

      <div>
        <Label htmlFor="c-budget">Budget</Label>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-2xl text-muted-foreground">$</span>
            <input
              id="c-budget"
              inputMode="numeric"
              value={draft.budget ? draft.budget.toLocaleString('en-US') : ''}
              onChange={(e) => set('budget', Number(e.target.value.replace(/\D/g, '').slice(0, 9)) || 0)}
              placeholder="0"
              className={cn(inputClass, 'h-14 pl-9 text-2xl font-medium tabular')}
            />
          </div>
          <div className="flex gap-1.5" role="group" aria-label="Budget presets">
            {PRESETS.map((p) => {
              const on = draft.budget === p
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => set('budget', p)}
                  className={cn(
                    'relative h-10 rounded-full px-3.5 text-sm tabular outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                    on ? 'text-background' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {on && <motion.span layoutId="budget-pill" transition={spring} className="absolute inset-0 rounded-full bg-foreground" />}
                  <span className="relative">${p / 1000}k</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <PrefilledField id="c-tax" label="Tax ID (EIN)" value={draft.taxId} onChange={(v) => set('taxId', v)} />
        <PrefilledField id="c-addr" label="Shipping address" value={draft.address} onChange={(v) => set('address', v)} />
      </div>

      <div className="flex justify-end">
        <Pressable type="submit" size="lg" disabled={!valid}>
          Continue <ArrowRight />
        </Pressable>
      </div>
    </form>
  )
}

function FolderPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { folders, addFolder } = useStore()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')

  const create = () => {
    if (!name.trim()) return
    const f = addFolder(name.trim())
    onChange(f.id)
    setName('')
    setAdding(false)
  }

  return (
    <div>
      <Label>Folder</Label>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Folder">
        {folders.map((f) => {
          const on = f.id === value
          return (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(f.id)}
              className={cn(
                'relative h-10 rounded-full border px-4 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                on ? 'border-transparent text-background' : 'border-border bg-card hover:border-foreground/20',
              )}
            >
              {on && <motion.span layoutId="folder-pill" transition={spring} className="absolute inset-0 rounded-full bg-foreground" />}
              <span className="relative">{f.name}</span>
            </button>
          )
        })}
        <motion.div layout style={{ borderRadius: 999 }} className="flex h-10 items-center overflow-hidden border border-dashed border-border">
          <AnimatePresence mode="popLayout" initial={false}>
            {adding ? (
              <motion.div key="i" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center pl-4 pr-1">
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      if (e.nativeEvent.isComposing || e.keyCode === 229) return
                      create()
                    }
                    if (e.key === 'Escape') setAdding(false)
                  }}
                  onBlur={() => !name && setAdding(false)}
                  aria-label="New folder name"
                  placeholder="Folder name"
                  className="w-32 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                <button type="button" onClick={create} aria-label="Create folder" className="inline-flex size-8 items-center justify-center rounded-full bg-foreground text-background">
                  <Check className="size-3.5" />
                </button>
              </motion.div>
            ) : (
              <motion.button
                key="b"
                type="button"
                onClick={() => setAdding(true)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="inline-flex h-full items-center gap-1.5 px-4 text-sm text-muted-foreground outline-none hover:text-foreground"
              >
                <Plus className="size-3.5" /> New
              </motion.button>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  )
}

function PrefilledField({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
}) {
  const [editing, setEditing] = useState(false)
  return (
    <div>
      <Label
        htmlFor={id}
        hint={
          !editing && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">From settings</span>
          )
        }
      >
        {label}
      </Label>
      <div className="relative">
        <input
          id={id}
          value={value}
          readOnly={!editing}
          onChange={(e) => onChange(e.target.value)}
          className={cn(inputClass, 'pr-11', !editing && 'cursor-default bg-muted/50 text-muted-foreground')}
        />
        <button
          type="button"
          onClick={() => setEditing((e) => !e)}
          aria-label={editing ? `Done editing ${label}` : `Edit ${label}`}
          className="absolute right-1.5 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {editing ? <Check className="size-3.5" /> : <Pencil className="size-3.5" />}
        </button>
      </div>
    </div>
  )
}
