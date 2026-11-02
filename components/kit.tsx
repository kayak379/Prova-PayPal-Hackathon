'use client'

import { animate, motion, useInView, type HTMLMotionProps } from 'motion/react'
import Link from 'next/link'
import { forwardRef, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'secondary' | 'ghost' | 'brand'

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_1px_0_0_rgba(255,255,255,0.15)_inset,0_6px_16px_-8px_rgba(15,20,30,0.5)]',
  brand: 'bg-brand text-white hover:bg-brand/90 shadow-[0_6px_16px_-8px_var(--brand)]',
  secondary: 'bg-card text-foreground border border-border hover:border-foreground/20',
  ghost: 'text-muted-foreground hover:text-foreground hover:bg-muted',
}

const base =
  'inline-flex items-center justify-center gap-2 rounded-full text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-40 disabled:pointer-events-none select-none [&_svg]:size-4 [&_svg]:shrink-0'

const sizes = {
  sm: 'h-8 px-3',
  md: 'h-10 px-4',
  lg: 'h-12 px-6 text-[15px]',
  icon: 'size-9',
}

type PressableProps = HTMLMotionProps<'button'> & {
  variant?: Variant
  size?: keyof typeof sizes
}

export const Pressable = forwardRef<HTMLButtonElement, PressableProps>(function Pressable(
  { variant = 'primary', size = 'md', className, ...props },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.96 }}
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    />
  )
})

const MotionLink = motion.create(Link)

export function PressableLink({
  href,
  variant = 'primary',
  size = 'md',
  className,
  children,
}: {
  href: string
  variant?: Variant
  size?: keyof typeof sizes
  className?: string
  children: React.ReactNode
}) {
  return (
    <MotionLink
      href={href}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.96 }}
      className={cn(base, variants[variant], sizes[size], className)}
    >
      {children}
    </MotionLink>
  )
}

export const inputClass =
  'w-full rounded-xl border border-input bg-card px-3.5 h-11 text-[15px] text-foreground placeholder:text-muted-foreground/70 outline-none transition-[border-color,box-shadow] focus:border-brand focus:shadow-[0_0_0_4px_var(--brand-soft)]'

export function Label({ htmlFor, children, hint }: { htmlFor?: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-muted-foreground">
        {children}
      </label>
      {hint}
    </div>
  )
}

export function AnimatedNumber({
  value,
  format,
  className,
}: {
  value: number
  format: (n: number) => string
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const prev = useRef(0)
  const inView = useInView(ref, { once: true })

  useEffect(() => {
    if (!inView || !ref.current) return
    const node = ref.current
    const controls = animate(prev.current, value, {
      duration: 0.8,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        node.textContent = format(v)
      },
    })
    prev.current = value
    return () => controls.stop()
  }, [value, inView, format])

  return (
    <span ref={ref} className={cn('tabular', className)}>
      {format(0)}
    </span>
  )
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(15,20,30,0.04),0_8px_24px_-12px_rgba(15,20,30,0.08)]',
        className,
      )}
      {...props}
    />
  )
}
