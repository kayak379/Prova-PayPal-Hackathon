'use client'

import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Card, inputClass, Label, Pressable } from './kit'

export function LoginForm() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const [error, setError] = useState('')
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const form = new FormData(e.currentTarget)
    try {
      const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: form.get('email'), password: form.get('password') }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      router.push('/dashboard'); router.refresh()
    } catch (e) { setError(e instanceof Error ? e.message : 'Sign-in failed.'); setLoading(false) }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
      <Card className="p-7">
        <h1 className="font-serif text-3xl">Welcome back</h1>
        {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
        <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <input id="email" name="email" type="email" autoComplete="email" className={inputClass} required />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <input id="password" name="password" type="password" autoComplete="current-password" className={inputClass} required />
          </div>
          <Pressable type="submit" size="lg" className="mt-2 w-full" disabled={loading}>
            <AnimatePresence mode="popLayout" initial={false}>
              {loading ? (
                <motion.span key="l" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }}>
                  <Loader2 className="animate-spin" />
                </motion.span>
              ) : (
                <motion.span key="t" exit={{ opacity: 0, scale: 0.6 }} className="inline-flex items-center gap-2">
                  Sign in <ArrowRight />
                </motion.span>
              )}
            </AnimatePresence>
          </Pressable>
        </form>
      </Card>
    </motion.div>
  )
}
