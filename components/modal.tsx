'use client'

import { AnimatePresence, motion } from 'motion/react'
import { X } from 'lucide-react'
import { useEffect, useId, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

export function Modal({
  open,
  onClose,
  layoutId,
  title,
  children,
  className,
  dismissable = true,
}: {
  open: boolean
  onClose: () => void
  layoutId?: string
  title: string
  children: React.ReactNode
  className?: string
  dismissable?: boolean
}) {
  const titleId = useId()

  useEffect(() => {
    if (!open || !dismissable) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, dismissable])

  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  )
  if (!mounted) return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            className="absolute inset-0 bg-foreground/25"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={dismissable ? onClose : undefined}
          />
          <motion.div
            layoutId={layoutId}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={layoutId ? undefined : { opacity: 0, scale: 0.96, y: 8 }}
            animate={layoutId ? undefined : { opacity: 1, scale: 1, y: 0 }}
            exit={layoutId ? undefined : { opacity: 0, scale: 0.96, y: 8 }}
            style={{ borderRadius: 24 }}
            className={cn(
              'relative w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto bg-card shadow-2xl',
              className,
            )}
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { delay: 0.12 } }}
              exit={
                layoutId
                  ? { opacity: 0, transition: { duration: 0.08 } }
                  : undefined
              }
              className="p-6"
            >
              <div className="mb-5 flex items-center justify-between">
                <h2 id={titleId} className="font-serif text-2xl leading-none">
                  {title}
                </h2>
                {dismissable && (
                  <button
                    onClick={onClose}
                    className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label="Close"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>
              {children}
            </motion.div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

const noopSubscribe = () => () => {}
