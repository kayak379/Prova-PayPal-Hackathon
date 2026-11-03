'use client'

import { motion } from 'motion/react'
import { Sparkles, User } from 'lucide-react'
import { PayPalMark } from '../brand'
import { formatTime } from '@/lib/format'
import type { AuditActor, AuditEntry } from '@/lib/types'
import { cn } from '@/lib/utils'

const ACTOR: Record<AuditActor, { label: string; className: string; icon: React.ReactNode }> = {
  agent: { label: 'Agent', className: 'bg-brand-soft text-brand', icon: <Sparkles className="size-3.5" /> },
  user: { label: 'You', className: 'bg-muted text-foreground', icon: <User className="size-3.5" /> },
  paypal: { label: 'PayPal', className: 'bg-paypal-blue/10 text-paypal-wordmark-navy', icon: <PayPalMark className="size-3.5" /> },
}

export function AuditLog({ entries }: { entries: AuditEntry[] }) {
  const sorted = [...entries].sort((a, b) => b.at - a.at)
  return (
    <ol className="relative rounded-2xl border border-border bg-card p-5">
      {sorted.map((e, i) => {
        const a = ACTOR[e.actor]
        return (
          <motion.li
            key={e.id}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0, transition: { delay: i * 0.035 } }}
            className="relative flex gap-4 pb-5 last:pb-0"
          >
            {i < sorted.length - 1 && <span className="absolute bottom-0 left-[15px] top-8 w-px bg-border" aria-hidden />}
            <span className={cn('relative inline-flex size-8 shrink-0 items-center justify-center rounded-full', a.className)}>
              {a.icon}
              <span className="sr-only">{a.label}</span>
            </span>
            <div className="min-w-0 pt-1">
              <p className="text-sm leading-relaxed">{e.message}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {a.label} · {formatTime(e.at)}
              </p>
            </div>
          </motion.li>
        )
      })}
    </ol>
  )
}
