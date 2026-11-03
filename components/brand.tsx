import Link from 'next/link'
import { cn } from '@/lib/utils'

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 36 36"
      fill="none"
      className={cn('inline-block size-8 shrink-0 text-primary', className)}
      aria-hidden="true"
      focusable="false"
    >
      <path d="M18 1 33 9.5 25.5 14 18 9.5 10.5 14 3 9.5Z" fill="currentColor" />
      <path d="M33 12.5V29.5L18 38V29.5L25.5 25V17Z" fill="var(--brand)" transform="translate(0 -3)" />
      <path d="m3 12.5 7.5 4.5v8l7.5 4.5V38L3 29.5Z" fill="currentColor" transform="translate(0 -3)" />
    </svg>
  )
}

export function Logo({ href = '/', className }: { href?: string; className?: string }) {
  return (
    <Link
      href={href}
      className={cn('group inline-flex items-center gap-2.5 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring', className)}
      aria-label="Prova home"
    >
      <LogoMark className="transition-transform duration-300 motion-safe:group-hover:-translate-y-0.5" />
      <span className="font-serif text-[26px] leading-none tracking-tight">prova</span>
    </Link>
  )
}

export function PayPalWordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-baseline font-sans text-[1.15em] font-extrabold italic tracking-[-0.02em]', className)}>
      <span className="text-paypal-wordmark-navy">Pay</span>
      <span className="text-paypal-wordmark-blue">Pal</span>
    </span>
  )
}

export function PayPalMark({ className }: { className?: string }) {
  return (
    <span
      className={cn('inline-flex size-6 items-center justify-center rounded-md bg-paypal-navy text-[13px] font-extrabold italic text-white', className)}
      aria-hidden
    >
      P
    </span>
  )
}
