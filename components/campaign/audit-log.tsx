'use client'

import { motion, useReducedMotion } from 'motion/react'
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

export function AuditLog({ entries, embedded = false }: { entries: AuditEntry[]; embedded?: boolean }) {
  const reduced = useReducedMotion()
  const sorted = [...entries].sort((a, b) => b.at - a.at)
  return (
    <ol aria-label="Campaign activity log" className={cn('relative p-5 sm:p-6', !embedded && 'rounded-2xl border border-border bg-card')}>
      {!sorted.length && <li className="py-5 text-center text-sm text-muted-foreground">Your campaign activity will appear here.</li>}
      {sorted.map((e, i) => {
        const a = ACTOR[e.actor]
        return (
          <motion.li
            key={e.id}
            initial={reduced ? false : { opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0, transition: { delay: reduced ? 0 : Math.min(i, 5) * 0.045, duration: 0.25 } }}
            className="group relative flex gap-4 pb-5 last:pb-0"
          >
            {i < sorted.length - 1 && <span className="absolute bottom-0 left-[15px] top-8 w-px bg-border" aria-hidden />}
            <motion.span whileHover={reduced ? undefined : { scale: 1.1 }} className={cn('relative inline-flex size-8 shrink-0 items-center justify-center rounded-full transition-colors', a.className)}>
              {a.icon}
              <span className="sr-only">{a.label}</span>
            </motion.span>
            <div className="min-w-0 flex-1 rounded-lg pt-1 transition-colors group-hover:bg-muted/40">
              <p className="text-sm leading-relaxed">{e.message.replace(/\bsandbox\s*/gi, '').replace(/\s*·\s*fulfillment simulated/gi, '').replace(/^(Retailer payouts\s*·\s*[^·]+)\s*·\s*PENDING\b/i, '$1')}</p>
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
