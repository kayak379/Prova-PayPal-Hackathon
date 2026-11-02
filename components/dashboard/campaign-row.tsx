'use client'

import { motion } from 'motion/react'
import { ArrowUpRight } from 'lucide-react'
import Link from 'next/link'
import { campaignSpent, usd } from '@/lib/format'
import type { Campaign } from '@/lib/types'

export function CampaignRow({ campaign, index }: { campaign: Campaign; index: number }) {
  const spent = campaignSpent(campaign)
  const pct = Math.min(1, spent / campaign.budget)
  const status = campaign.orders.length === 0 ? 'Draft' : pct > 0.95 ? 'Fulfilled' : 'Active'

  return (
    <motion.li
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0, transition: { delay: 0.04 * index } }}
      className="border-b border-border last:border-0"
    >
      <Link
        href={`/campaigns/${campaign.id}`}
        className="group grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-4 outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 sm:grid-cols-[1fr_200px_90px_24px] sm:pl-14"
      >
        <div className="min-w-0">
          <p className="truncate font-medium">{campaign.name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {campaign.orders.length} {campaign.orders.length === 1 ? 'order' : 'orders'}
          </p>
        </div>
        <div className="hidden sm:block">
          <div className="flex justify-between text-xs tabular">
            <span>{usd(spent)}</span>
            <span className="text-muted-foreground">{usd(campaign.budget)}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
            <motion.div
              className="h-full origin-left rounded-full bg-foreground"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: pct }}
              transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.1 + index * 0.05 }}
            />
          </div>
        </div>
        <span
          className={`justify-self-end rounded-full px-2.5 py-1 text-xs font-medium ${
            status === 'Draft'
              ? 'bg-muted text-muted-foreground'
              : status === 'Active'
                ? 'bg-brand-soft text-brand'
                : 'bg-success-soft text-success'
          }`}
        >
          {status}
        </span>
        <ArrowUpRight className="hidden size-4 text-muted-foreground transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground sm:block" />
      </Link>
    </motion.li>
  )
}
