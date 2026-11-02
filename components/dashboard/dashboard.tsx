'use client'

import { motion } from 'motion/react'
import { Plus } from 'lucide-react'
import { useCallback } from 'react'
import { AnimatedNumber, PressableLink } from '../kit'
import { FolderGroup } from './folder-group'
import { NewFolderButton } from './new-folder-button'
import { DashboardGraphic } from './dashboard-graphic'
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
    { label: 'Total Spent', value: totalSpent, format: fmt },
    {
      label: 'Remaining budget',
      value: Math.max(0, totalBudget - totalSpent),
      format: fmt,
    },
    { label: 'Orders', value: orders, format: count },
  ]

  return (
    <main className="dashboard-surface mx-auto max-w-6xl px-5 pb-24 pt-10">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="font-serif text-5xl tracking-tight">Campaigns</h1>
        <div className="flex items-center gap-2">
          <NewFolderButton />
          <PressableLink href="/campaigns/new">
            <Plus /> New campaign
          </PressableLink>
        </div>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-[minmax(0,1fr)_300px] lg:grid-cols-[minmax(0,1fr)_380px]">
        <DashboardGraphic />
        <dl className="grid grid-cols-3 gap-3 md:grid-cols-1">
          {stats.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0, transition: { delay: i * 0.05 } }}
              className="flex min-w-0 flex-col justify-center rounded-2xl border border-border bg-card px-3 py-3 sm:px-5"
            >
              <dt className="text-xs text-muted-foreground">{s.label}</dt>
              <dd className="mt-1 break-words text-xl font-medium tracking-tight sm:text-2xl">
                <AnimatedNumber value={s.value} format={s.format} />
              </dd>
            </motion.div>
          ))}
        </dl>
      </div>

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
