'use client'

import { useEffect, useRef } from 'react'
import { ArrowRight, LoaderCircle, ShieldCheck } from 'lucide-react'
import type { FinanceAction } from '@/lib/types'
import { priceCents } from '@/lib/money'
import { usdPrecise } from '@/lib/format'
import { Modal } from '../modal'
import { Pressable } from '../kit'
import { PayPalWordmark } from '../brand'

const dollars = (cents: number) => usdPrecise(cents / 100)

export function FundingReview({
  action, busy, activity, error, pending, onClose, onConfirm,
}: {
  action: FinanceAction | null
  busy: boolean
  activity: string
  error: string
  pending: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  const content = useRef<HTMLDivElement>(null)
  const open = action !== null

  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const dialog = () => content.current?.closest<HTMLElement>('[role="dialog"]')
    const frame = requestAnimationFrame(() => {
      content.current?.focus()
    })
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const elements = dialog()?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]',
      )
      const first = elements?.[0]
      const last = elements?.[elements.length - 1]
      if (!first || !last) {
        event.preventDefault()
        content.current?.focus()
      } else if (event.shiftKey && (document.activeElement === first || document.activeElement === content.current)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', trapFocus)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', trapFocus)
      document.body.style.overflow = previousOverflow
      previousFocus?.focus()
    }
  }, [open])

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissable={!busy}
      title="Review funding request"
      className="max-w-lg"
    >
      {action && (
        <div ref={content} tabIndex={-1} className="outline-none" aria-busy={busy}>
          <p className="mb-5 break-words text-sm leading-relaxed text-muted-foreground">
            {action.title}
          </p>
          <div className="rounded-2xl border border-brand/15 bg-brand-soft/40 p-5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Request total</span>
              <PayPalWordmark className="text-sm" />
            </div>
            <p className="mt-2 text-4xl font-medium tracking-tight tabular">
              {dollars(action.amountCents)}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">Includes estimated shipping and tax</p>
          </div>
          <div className="my-5 divide-y divide-border">
            {action.items?.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="break-words font-medium">{item.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.qty} × {dollars(priceCents(item))}</p>
                </div>
                <span className="shrink-0 tabular">{dollars(priceCents(item) * item.qty)}</span>
              </div>
            ))}
            {action.charges && (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 py-3 text-sm text-muted-foreground">
                <dt>Estimated shipping</dt>
                <dd className="text-right tabular">{dollars(action.charges.shipping)}</dd>
                <dt>Estimated tax</dt>
                <dd className="text-right tabular">{dollars(action.charges.tax)}</dd>
              </dl>
            )}
          </div>
          <div className="flex gap-2.5 rounded-xl bg-muted/60 p-3.5 text-xs leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand" />
            <p className="min-w-0 break-words">
              {action.emailInvoice
                ? <>PayPal will be asked to email this invoice to <span className="font-medium text-foreground">{action.email}</span> when you confirm.</>
                : 'An invoice link will be created for you to share. No emails will be sent.'}
            </p>
          </div>
          {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
          {busy && (
            <p role="status" className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 shrink-0 animate-spin motion-reduce:animate-none" />{activity}
            </p>
          )}
          <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-border pt-5">
            <Pressable variant="secondary" disabled={busy} onClick={onClose}>Back to edit</Pressable>
            <Pressable variant="brand" disabled={busy} onClick={onConfirm}>
              {busy ? 'Creating invoice…' : pending ? 'Retry same operation' : 'Confirm invoice'}
              {!busy && <ArrowRight />}
            </Pressable>
          </div>
        </div>
      )}
    </Modal>
  )
}
