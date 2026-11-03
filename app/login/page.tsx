import type { Metadata } from 'next'
import { Logo } from '@/components/brand'
import { LoginForm } from '@/components/login-form'
import { ThemeToggle } from '@/components/theme-toggle'

export const metadata: Metadata = { title: 'Sign in — Prova' }

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5">
      <div className="absolute right-5 top-4"><ThemeToggle /></div>
      <Logo className="mb-10" />
      <LoginForm />
    </main>
  )
}
