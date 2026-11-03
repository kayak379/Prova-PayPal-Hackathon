import { ArrowRight } from 'lucide-react'
import { Logo } from '@/components/brand'
import { HeroDemo } from '@/components/home/hero-demo'
import { PressableLink } from '@/components/kit'
import { ThemeToggle } from '@/components/theme-toggle'

export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5">
        <Logo />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <PressableLink href="/login" variant="ghost" size="sm">
            Sign in
          </PressableLink>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-5 py-12 lg:grid-cols-[1.1fr_1fr] lg:py-20">
        <section>
          <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <span className="size-1.5 rounded-full bg-brand" />
            Agentic commerce for disaster relief
          </p>
          <h1 className="text-balance font-serif text-5xl leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
            Relief supplies,
            <br />
            <span className="italic text-brand">sourced in minutes.</span>
          </h1>
          <p className="mt-6 max-w-md text-pretty text-lg leading-relaxed text-muted-foreground">
            Describe the disaster. Set a budget. Prova plans, optimizes, and purchases — with you approving every dollar.
          </p>
          <div className="mt-10 flex items-center gap-3">
            <PressableLink href="/login" size="lg">
              Get started <ArrowRight />
            </PressableLink>
          </div>
        </section>
        <HeroDemo />
      </main>
    </div>
  )
}
