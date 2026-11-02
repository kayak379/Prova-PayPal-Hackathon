'use client'

import { AnimatePresence, motion } from 'motion/react'
import { ChevronRight, Folder as FolderIcon, FolderOpen } from 'lucide-react'
import { useId, useState } from 'react'
import { CampaignRow } from './campaign-row'
import { softSpring } from '../motion-provider'
import type { Campaign, Folder } from '@/lib/types'

export function FolderGroup({
  folder,
  campaigns,
  defaultOpen,
  index,
}: {
  folder: Folder
  campaigns: Campaign[]
  defaultOpen?: boolean
  index: number
}) {
  const [open, setOpen] = useState(!!defaultOpen)
  const panelId = useId()

  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0, transition: { delay: 0.1 + index * 0.05 } }}
      className="overflow-hidden rounded-2xl border border-border bg-card"
    >
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="group flex w-full items-center gap-3 px-5 py-4 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50"
      >
        <motion.span animate={{ rotate: open ? 90 : 0 }} className="text-muted-foreground">
          <ChevronRight className="size-4" />
        </motion.span>
        <span className="relative size-4 text-muted-foreground">
          <AnimatePresence initial={false} mode="popLayout">
            {open ? (
              <motion.span key="o" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} className="absolute inset-0">
                <FolderOpen className="size-4 text-brand" />
              </motion.span>
            ) : (
              <motion.span key="c" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} className="absolute inset-0">
                <FolderIcon className="size-4" />
              </motion.span>
            )}
          </AnimatePresence>
        </span>
        <span className="flex-1 font-medium">{folder.name}</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground tabular">{campaigns.length}</span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            transition={softSpring}
          >
            <div className="border-t border-border">
              {campaigns.length === 0 ? (
                <p className="px-5 py-6 text-sm text-muted-foreground">Empty</p>
              ) : (
                <ul>
                  {campaigns.map((c, i) => (
                    <CampaignRow key={c.id} campaign={c} index={i} />
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  )
}
