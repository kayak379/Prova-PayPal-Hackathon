'use client'

import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, FolderPlus, X } from 'lucide-react'
import { useState } from 'react'
import { useStore } from '@/lib/store'

export function NewFolderButton() {
  const { addFolder } = useStore()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    addFolder(name.trim())
    setName('')
    setEditing(false)
  }

  return (
    <motion.div
      layout
      style={{ borderRadius: 999 }}
      className="flex h-10 items-center overflow-hidden border border-border bg-card"
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {editing ? (
          <motion.form
            key="form"
            onSubmit={submit}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-1 pl-4 pr-1"
          >
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
              placeholder="Folder name"
              aria-label="Folder name"
              className="w-36 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <button type="button" onClick={() => setEditing(false)} aria-label="Cancel" className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted">
              <X className="size-3.5" />
            </button>
            <button type="submit" aria-label="Create folder" disabled={!name.trim()} className="inline-flex size-8 items-center justify-center rounded-full bg-foreground text-background transition-opacity disabled:opacity-30">
              <ArrowRight className="size-3.5" />
            </button>
          </motion.form>
        ) : (
          <motion.button
            key="btn"
            onClick={() => setEditing(true)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            whileTap={{ scale: 0.96 }}
            className="inline-flex h-full items-center gap-2 px-4 text-sm font-medium outline-none"
          >
            <FolderPlus className="size-4" /> New folder
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
