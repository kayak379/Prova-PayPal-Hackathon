'use client'

import { motion } from 'motion/react'
import { ChevronLeft, Download, Plus, Settings } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useState } from 'react'
import { AnimatedNumber, Pressable, PressableLink } from '../kit'
import { Modal } from '../modal'
import { CampaignSettings } from './campaign-settings'
import { spring } from '../motion-provider'
import { BudgetRing } from './budget-ring'
import { OrdersList } from './orders-list'
import { FinancePanel } from './finance-panel'
import { AuditLog } from './audit-log'
import { campaignSpent, usd } from '@/lib/format'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'

const TABS = ['Orders', 'Funding', 'Finance', 'Audit log'] as const

export function CampaignDetail({ id }: { id: string }) {
  const { campaigns, folders } = useStore()
  const [tab, setTab] = useState<(typeof TABS)[number]>('Orders')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const fmt = useCallback((n: number) => usd(n), [])
  const count = useCallback((n: number) => Math.round(n).toString(), [])
  const campaign = campaigns.find((c) => c.id === id)

  if (!campaign) {
    return (
      <main className="mx-auto flex max-w-6xl flex-col items-start gap-4 px-5 py-20">
        <h1 className="font-serif text-4xl">Campaign not found</h1>
        <PressableLink href="/dashboard" variant="secondary">
          Back to campaigns
        </PressableLink>
      </main>
    )
  }

  const spent = campaignSpent(campaign)
  const remaining = Math.max(0, campaign.budget - spent)
  const folder = folders.find((f) => f.id === campaign.folderId)
  const supplierCount = new Set(campaign.orders.map((o) => o.supplier)).size

  return (
    <main className="mx-auto max-w-6xl px-5 pb-24 pt-6 lg:pt-10">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> {folder?.name ?? 'Campaigns'}
      </Link>

      <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="min-w-0 break-words text-balance font-serif text-4xl tracking-tight sm:text-5xl"
        >
          {campaign.name}
        </motion.h1>
        <div className="flex shrink-0 items-center gap-2">
          <Pressable
            variant="secondary"
            size="icon"
            aria-label="Campaign settings"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings />
          </Pressable>
          <PressableLink
            href={`/campaigns/new?campaign=${campaign.id}`}
            variant="brand"
          >
            <Plus /> Purchase more
          </PressableLink>
        </div>
      </div>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Manage supplies, bring sponsors on board, and keep every payment in
          view.
        </p>

      <section
        aria-label="Campaign overview"
        className="mt-8 overflow-hidden rounded-2xl border border-border bg-card"
      >
        <div className="grid md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,.65fr)_minmax(0,.65fr)]">
          <div className="flex items-center gap-4 px-5 py-5 sm:px-6">
            <div className="flex size-14 shrink-0 items-center justify-center [&>div]:size-14 [&_span]:text-[11px]">
              <BudgetRing
                value={campaign.budget > 0 ? spent / campaign.budget : 0}
              />
            </div>
            <dl className="min-w-0">
              <dt className="text-xs text-muted-foreground">Deployed</dt>
              <dd className="mt-1 text-2xl font-medium leading-none tracking-tight tabular">
                <AnimatedNumber value={spent} format={fmt} />
              </dd>
              <dd className="mt-2 text-xs text-muted-foreground">
                of {usd(campaign.budget)} budget
              </dd>
            </dl>
          </div>
          <dl className="grid grid-cols-3 border-t border-border md:col-span-3 md:grid-cols-[minmax(0,1fr)_minmax(0,.65fr)_minmax(0,.65fr)] md:border-t-0">
            {[
              { label: 'Remaining', value: remaining, format: fmt },
              { label: 'Orders', value: campaign.orders.length, format: count },
              { label: 'Suppliers', value: supplierCount, format: count },
            ].map((stat) => (
              <div
                key={stat.label}
                className="flex flex-col justify-center border-l border-border px-4 py-5 first:border-l-0 sm:px-6 md:first:border-l"
              >
                <dt className="text-xs text-muted-foreground">{stat.label}</dt>
                <dd className="mt-2 text-xl font-medium leading-none tracking-tight tabular sm:text-2xl">
                  <AnimatedNumber value={stat.value} format={stat.format} />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <div className="mt-10">
        <div
          role="tablist"
          aria-label="Campaign sections"
          className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-full bg-muted p-1"
        >
          {TABS.map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                'relative h-9 shrink-0 rounded-full px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring sm:px-5',
                tab === t
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {tab === t && (
                <motion.span
                  layoutId="campaign-tab"
                  transition={spring}
                  className="absolute inset-0 rounded-full bg-card shadow-sm"
                />
              )}
              <span className="relative">{t}</span>
            </button>
          ))}
        </div>

        <motion.div
          key={tab}
          role="tabpanel"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6"
        >
          {(tab === 'Orders' || tab === 'Audit log') && (
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-serif text-3xl tracking-tight">
                  {tab === 'Orders' ? 'Your purchases' : 'Campaign activity'}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {tab === 'Orders'
                    ? 'Review supply bundles, payment receipts, and refunds.'
                    : 'A history of decisions and financial updates.'}
                </p>
              </div>
              <span className="text-xs text-muted-foreground">
                PayPal sandbox · Simulated fulfillment
              </span>
            </div>
          )}
          {tab === 'Orders' ? (
            <OrdersList orders={campaign.orders} campaignId={campaign.id} />
          ) : tab === 'Funding' ? (
            <FinancePanel campaign={campaign} mode="funding" />
          ) : tab === 'Finance' ? (
            <FinancePanel campaign={campaign} mode="finance" />
          ) : (
            <AuditLog entries={campaign.audit} />
          )}
        </motion.div>
      </div>
      <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6">
        <p className="text-sm text-muted-foreground">
          Download campaign settings, orders, and audit history.
        </p>
        <Pressable
          variant="secondary"
          onClick={() => {
            const data = {
              ...campaign,
              folder: folder?.name ?? null,
              spent,
              remaining,
              exportedAt: new Date().toISOString(),
            }
            const url = URL.createObjectURL(
              new Blob([JSON.stringify(data, null, 2)], {
                type: 'application/json',
              }),
            )
            const link = document.createElement('a')
            link.href = url
            link.download = `${
              campaign.name
                .replace(/[^a-z0-9]+/gi, '-')
                .replace(/^-|-$/g, '')
                .slice(0, 80) || 'campaign'
            }-${campaign.id}.json`
            document.body.appendChild(link)
            link.click()
            link.remove()
            setTimeout(() => URL.revokeObjectURL(url), 1000)
          }}
        >
          <Download /> Export campaign
        </Pressable>
      </div>
      <Modal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="Campaign settings"
      >
        {settingsOpen && (
          <CampaignSettings
            campaign={campaign}
            onClose={() => setSettingsOpen(false)}
          />
        )}
      </Modal>
    </main>
  )
}
