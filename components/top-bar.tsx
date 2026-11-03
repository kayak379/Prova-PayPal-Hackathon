'use client'

import { motion } from 'motion/react'
import { Settings2 } from 'lucide-react'
import { useState } from 'react'
import { Logo } from './brand'
import { SettingsDialog } from './settings-dialog'
import { useStore } from '@/lib/store'
import { ThemeToggle } from './theme-toggle'

export function TopBar({ children }: { children?: React.ReactNode }) {
  const { settings } = useStore()
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
        <Logo href="/dashboard" />
        {children}
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <motion.span
            key={settings.orgName}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="hidden max-w-[220px] truncate text-sm font-medium sm:block"
          >
            {settings.orgName}
          </motion.span>
          <span className="relative size-9">
            {!open && (
              <motion.span
                layoutId="settings-surface"
                style={{ borderRadius: 999 }}
                className="absolute inset-0 bg-muted"
              />
            )}
            <motion.button
              onClick={() => setOpen(true)}
              whileHover={{ rotate: 60 }}
              whileTap={{ scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 300, damping: 15 }}
              className="relative inline-flex size-9 items-center justify-center rounded-full text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Organization settings"
            >
              <Settings2 className="size-4" />
            </motion.button>
          </span>
        </div>
      </div>
      <SettingsDialog open={open} onClose={() => setOpen(false)} />
    </header>
  )
}
