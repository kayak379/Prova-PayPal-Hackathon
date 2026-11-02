'use client'

import { motion, useReducedMotion } from 'motion/react'
import { Check, Wifi } from 'lucide-react'
import { useEffect, useState } from 'react'

export function PaymentTap({ active, complete }: { active: boolean; complete: boolean }) {
  const reduceMotion = useReducedMotion()
  const [tapped, setTapped] = useState(false)

  useEffect(() => {
    if (!active) { setTapped(false); return }
    const timer = setTimeout(() => setTapped(true), reduceMotion ? 0 : 1100)
    return () => clearTimeout(timer)
  }, [active, reduceMotion])

  const label = complete ? 'Payment complete' : tapped ? 'Processing payment…' : active ? 'Tapping card…' : 'Ready to pay'

  return (
    <div className="relative flex h-[230px] w-[280px] shrink-0 flex-col items-center justify-center">
      <div aria-hidden="true" className="relative h-[190px] w-full">
        <motion.div layoutId="payment-surface" transition={{ layout: { duration: reduceMotion ? 0 : 2.2, ease: [0.45, 0, 0.2, 1] } }} className="absolute bottom-0 right-8 h-[154px] w-[112px] rotate-[-8deg] rounded-[20px] border-2 border-white/30 bg-[#142e25] p-3 shadow-xl">
          <motion.div initial={{ opacity: reduceMotion ? 1 : 0 }} animate={{ opacity: 1 }} transition={{ delay: reduceMotion ? 0 : 0.8, duration: 1 }} className="flex h-[76px] flex-col items-center justify-center gap-1 rounded-lg bg-[#f6f2e7] text-primary">
            {complete ? (
              <motion.span initial={{ scale: reduceMotion ? 1 : 0 }} animate={{ scale: 1 }} className="flex size-8 items-center justify-center rounded-full bg-success text-white">
                <Check className="size-5" strokeWidth={3} />
              </motion.span>
            ) : tapped ? (
              <motion.span className="size-6 rounded-full border-[3px] border-primary/20 border-t-primary" animate={reduceMotion ? {} : { rotate: 360 }} transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }} />
            ) : <Wifi className="size-7 rotate-90" />}
            {(complete || tapped) && <span className="text-[9px] font-semibold">{complete ? 'APPROVED' : 'PROCESSING'}</span>}
          </motion.div>
          <motion.div initial={{ opacity: reduceMotion ? 1 : 0 }} animate={{ opacity: 1 }} transition={{ delay: reduceMotion ? 0 : 1.2, duration: 0.8 }} className="mt-3 grid grid-cols-3 gap-1.5">
            {Array.from({ length: 9 }, (_, i) => <span key={i} className={`h-2 rounded-sm ${i === 8 ? 'bg-[#aaceaa]' : 'bg-white/25'}`} />)}
          </motion.div>
        </motion.div>
        {tapped && !reduceMotion && [0, 1, 2].map((i) => (
          <motion.span key={i} className="absolute left-[142px] top-[60px] size-8 rounded-full border-2 border-[#dce9d8]" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: [0.5, 2.5], opacity: [0.8, 0] }} transition={{ delay: i * 0.15, duration: 0.9 }} />
        ))}
        <motion.div
          layoutId="payment-card"
          className="absolute left-3 top-2 flex h-[88px] w-[142px] flex-col justify-between rounded-xl border border-white/40 bg-paypal-gold p-3 text-paypal-navy shadow-[0_14px_30px_rgba(0,0,0,0.25)]"
          initial={false}
          animate={reduceMotion ? { x: 0, y: 0 } : active ? { x: [0, 42, 42, -6], y: [0, 42, 42, -12], rotate: [-14, -8, -8, -14] } : { x: 0, y: 0, rotate: -14 }}
          transition={{ duration: 1.8, times: [0, 0.5, 0.68, 1], ease: 'easeInOut', layout: { duration: reduceMotion ? 0 : 2.4, ease: [0.45, 0, 0.2, 1] } }}
        >
          <motion.span initial={{ opacity: reduceMotion ? 1 : 0 }} animate={{ opacity: 1 }} transition={{ delay: reduceMotion ? 0 : 1, duration: 0.9 }} className="flex items-center justify-between"><span className="h-4 w-6 rounded border border-paypal-navy/25 bg-white/35" /><Wifi className="size-4 rotate-90" /></motion.span>
          <motion.span initial={{ opacity: reduceMotion ? 1 : 0 }} animate={{ opacity: 1 }} transition={{ delay: reduceMotion ? 0 : 1.3, duration: 0.9 }} className="flex items-end justify-between"><span className="text-lg font-extrabold italic">PayPal</span><span className="text-[8px] tracking-widest">BUSINESS</span></motion.span>
        </motion.div>
      </div>
      <p role="status" aria-live="polite" className="mt-4 flex items-center gap-2 text-sm font-medium text-[#fffcf4]">
        {complete && <Check className="size-4" />} {label}
      </p>
    </div>
  )
}
