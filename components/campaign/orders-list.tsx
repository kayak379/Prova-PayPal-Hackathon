'use client'

import { AnimatePresence, motion } from 'motion/react'
import { ChevronDown, PackageOpen } from 'lucide-react'
import { useState } from 'react'
import { FinancePanel } from './finance-panel'
import { useStore } from '@/lib/store'
import { PressableLink } from '../kit'
import { softSpring } from '../motion-provider'
import { formatTime, usd, usdPrecise } from '@/lib/format'
import type { Order, OrderStatus } from '@/lib/types'
import { cn } from '@/lib/utils'

const STATUS: Record<OrderStatus, string> = {
  confirmed: 'bg-brand-soft text-brand',
  processing: 'bg-muted text-muted-foreground',
  shipped: 'bg-paypal-blue/10 text-paypal-wordmark-blue',
  delivered: 'bg-success-soft text-success',
}

export function OrdersList({
  orders,
  campaignId,
}: {
  orders: Order[]
  campaignId: string
}) {
  const { campaigns } = useStore()
  const campaign = campaigns.find((c) => c.id === campaignId)
  const [open, setOpen] = useState<string | null>(null)

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border px-6 py-14 text-center">
        <PackageOpen className="size-8 text-muted-foreground" />
        <p className="text-muted-foreground">No orders yet</p>
        <PressableLink href={`/campaigns/new?campaign=${campaignId}`}>
          Start a request
        </PressableLink>
      </div>
    )
  }

  return (
    <ul className="overflow-hidden rounded-2xl border border-border bg-card">
      {orders.map((o, i) => {
        const expanded = open === o.id
        return (
          <motion.li
            key={o.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0, transition: { delay: i * 0.04 } }}
            className="border-b border-border last:border-0"
          >
            <button
              onClick={() => setOpen(expanded ? null : o.id)}
              aria-expanded={expanded}
              className="grid w-full grid-cols-[1fr_auto_auto] items-center gap-4 px-5 py-4 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 sm:grid-cols-[1fr_200px_100px_90px_20px]"
            >
              <div className="min-w-0">
                <p className="font-medium">
                  {o.supplier}
                  {o.mock && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      Mock data
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatTime(o.createdAt)}
                </p>
              </div>
              <span className="hidden truncate font-mono text-xs text-muted-foreground sm:block">
                {o.paypalTxn}
              </span>
              <span
                className={cn(
                  'justify-self-start rounded-full px-2.5 py-1 text-xs font-medium capitalize',
                  STATUS[o.status],
                )}
              >
                {o.status}
              </span>
              <span className="text-right text-sm tabular">{usd(o.total)}</span>
              <motion.span
                animate={{ rotate: expanded ? 180 : 0 }}
                className="hidden text-muted-foreground sm:block"
              >
                <ChevronDown className="size-4" />
              </motion.span>
            </button>
            <AnimatePresence initial={false}>
              {expanded && (
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: 'auto' }}
                  exit={{ height: 0 }}
                  transition={softSpring}
                  className="overflow-hidden"
                >
                  <div className="mx-5 mb-4 rounded-xl bg-muted/50 p-4">
                    <p className="mb-2 font-mono text-xs text-muted-foreground">
                      {o.id}
                    </p>
                    <ul className="flex flex-col gap-1.5 text-sm">
                      {o.items.map((it) => (
                        <li key={it.id} className="flex justify-between gap-4">
                          <span>
                            <span className="tabular">
                              {it.qty.toLocaleString()}
                            </span>{' '}
                            × {it.name}
                          </span>
                          <span className="text-muted-foreground tabular">
                            {usdPrecise(it.unitPrice)}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {campaign && (
                      <div className="mt-4">
                        <FinancePanel
                          campaign={campaign}
                          mode="refund"
                          refundOrderId={o.id}
                        />
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.li>
        )
      })}
    </ul>
  )
}
