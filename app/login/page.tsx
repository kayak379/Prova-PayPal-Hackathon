import type { Metadata } from 'next'
import { Logo } from '@/components/brand'
import { LoginForm } from '@/components/login-form'

export const metadata: Metadata = { title: 'Sign in — Prova' }

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5">
      <Logo className="mb-10" />
      <LoginForm />
    </main>
  )
}
