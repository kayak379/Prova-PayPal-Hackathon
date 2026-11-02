'use client'

import { motion } from 'motion/react'
import { Plus } from 'lucide-react'
import { useCallback } from 'react'
import { AnimatedNumber, PressableLink } from '../kit'
import { FolderGroup } from './folder-group'
import { NewFolderButton } from './new-folder-button'
import { campaignSpent, usd } from '@/lib/format'
import { useStore } from '@/lib/store'

export function Dashboard() {
  const { folders, campaigns } = useStore()
  const fmt = useCallback((n: number) => usd(n), [])
  const count = useCallback((n: number) => Math.round(n).toString(), [])

  const totalBudget = campaigns.reduce((s, c) => s + c.budget, 0)
  const totalSpent = campaigns.reduce((s, c) => s + campaignSpent(c), 0)
  const orders = campaigns.reduce((s, c) => s + c.orders.length, 0)

  const stats = [
    { label: 'Budget', value: totalBudget, format: fmt },
    { label: 'Deployed', value: totalSpent, format: fmt },
    { label: 'Orders', value: orders, format: count },
  ]

  return (
    <main className="mx-auto max-w-6xl px-5 pb-24 pt-10">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="font-serif text-5xl tracking-tight">Campaigns</h1>
        <div className="flex items-center gap-2">
          <NewFolderButton />
          <PressableLink href="/campaigns/new">
            <Plus /> New campaign
          </PressableLink>
        </div>
      </div>

      <dl className="mt-8 grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-border bg-border">
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0, transition: { delay: i * 0.05 } }}
            className="bg-card px-5 py-4"
          >
            <dt className="text-xs text-muted-foreground">{s.label}</dt>
            <dd className="mt-1 text-2xl font-medium tracking-tight">
              <AnimatedNumber value={s.value} format={s.format} />
            </dd>
          </motion.div>
        ))}
      </dl>

      <motion.div layout className="mt-8 flex flex-col gap-3">
        {folders.map((f, i) => (
          <FolderGroup
            key={f.id}
            folder={f}
            campaigns={campaigns.filter((c) => c.folderId === f.id)}
            defaultOpen={i === 0}
            index={i}
          />
        ))}
      </motion.div>
    </main>
  )
}
