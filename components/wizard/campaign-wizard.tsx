'use client'

import { AnimatePresence, motion } from 'motion/react'
import { X } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Logo } from '../brand'
import { ThemeToggle } from '../theme-toggle'
import { softSpring } from '../motion-provider'
import { Stepper } from './stepper'
import { StepGraphic } from './step-graphic'
import { StepCampaign } from './step-campaign'
import { StepRequest } from './step-request'
import { StepReview } from './step-review'
import { StepCheckout } from './step-checkout'
import { campaignSpent } from '@/lib/format'
import { useStore } from '@/lib/store'
import type { Plan } from '@/lib/types'
import {
  discoveryRequest,
  splitLegacyRequest,
  type RequestAttachment,
} from '@/lib/campaign-request'

export type Draft = {
  name: string
  folderId: string
  budget: number
  taxId: string
  address: string
}

const slide = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 40, filter: 'blur(4px)' }),
  center: { opacity: 1, x: 0, filter: 'blur(0px)' },
  exit: (dir: number) => ({ opacity: 0, x: dir * -40, filter: 'blur(4px)' }),
}

export function CampaignWizard({ existingId }: { existingId?: string }) {
  const {
    settings,
    folders,
    campaigns,
    addCampaign,
    updateCampaign,
    saveProposal,
  } = useStore()
  const [createdId, setCreatedId] = useState(existingId)
  const existing = campaigns.find((c) => c.id === createdId)

  const [draft, setDraft] = useState<Draft>(() =>
    existing
      ? {
          name: existing.name,
          folderId: existing.folderId,
          budget: existing.budget - campaignSpent(existing),
          taxId: existing.taxId,
          address: existing.address,
        }
      : {
          name: '',
          folderId: folders[0]?.id ?? '',
          budget: 10000,
          taxId: settings.taxId,
          address: settings.address,
        },
  )
  const [[step, dir], setStep] = useState<[number, number]>([
    existing
      ? typeof window !== 'undefined' &&
        new URLSearchParams(window.location.search).has('payment')
        ? 3
        : existing.proposal
          ? 2
          : 1
      : 0,
    1,
  ])
  const [prompt, setPrompt] = useState(
    () => splitLegacyRequest(existing?.request || '').prompt,
  )
  const [csv, setCsv] = useState<RequestAttachment | null>(
    () =>
      existing?.requestAttachment ??
      splitLegacyRequest(existing?.request || '').attachment,
  )
  const [plan, setPlan] = useState<Plan | null>(existing?.proposal || null)
  const [agentProgress, setAgentProgress] = useState(-1)
  const [paying, setPaying] = useState(false)
  const [paymentComplete, setPaymentComplete] = useState(false)
  const [discovering, setDiscovering] = useState(false)

  useEffect(() => {
    if (createdId) void saveProposal(createdId, prompt, plan, csv).catch(() => {})
  }, [createdId, prompt, plan, csv, saveProposal])

  const go = (next: number) => setStep([next, next > step ? 1 : -1])
  const minStep = 0
  const exitHref = existing ? `/campaigns/${existing.id}` : '/dashboard'

  if (createdId && !existing)
    return (
      <main className="p-10">
        <h1 className="font-serif text-3xl">
          Campaign not found in this workspace
        </h1>
        <Link href="/dashboard">Return to campaigns</Link>
      </main>
    )

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-1.5 px-4 sm:gap-4 sm:px-5">
          <Logo href="/dashboard" className="[&_span]:hidden sm:[&_span]:inline" />
          <Stepper
            step={step}
            minStep={minStep}
            onSelect={paying || discovering || paymentComplete ? undefined : go}
          />
          <div className="flex shrink-0 items-center gap-1.5">
            <ThemeToggle />
            <Link
              href={exitHref}
              aria-label="Exit"
              className="inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-6 px-5 py-6 lg:grid-cols-[340px_1fr] lg:gap-10 lg:py-10">
        <aside className="lg:sticky lg:top-26 lg:h-[calc(100dvh-8.5rem)]">
          <StepGraphic
            step={step}
            agentProgress={agentProgress}
            draft={draft}
            plan={plan}
            paying={paying}
            paymentComplete={paymentComplete}
          />
        </aside>

        <section className="relative min-w-0">
          <AnimatePresence mode="wait" custom={dir} initial={false}>
            <motion.div
              key={step}
              custom={dir}
              variants={slide}
              initial="enter"
              animate="center"
              exit="exit"
              transition={softSpring}
            >
              {step === 0 && (
                <StepCampaign
                  draft={draft}
                  setDraft={setDraft}
                  onNext={async () => {
                    try {
                    if (existing) {
                      await updateCampaign(existing.id, {
                        ...draft,
                        budget: draft.budget + campaignSpent(existing),
                      })
                    } else {
                      const campaign = await addCampaign(draft)
                      window.history.replaceState(
                        null,
                        '',
                        `/campaigns/new?campaign=${campaign.id}`,
                      )
                      setCreatedId(campaign.id)
                    }
                    go(1)
                    } catch { /* Store shows a retryable save error. */ }
                  }}
                />
              )}
              {step === 1 && (
                <StepRequest
                  prompt={prompt}
                  setPrompt={setPrompt}
                  csv={csv}
                  setCsv={setCsv}
                  budget={draft.budget}
                  campaignName={draft.name}
                  onProgress={setAgentProgress}
                  onBack={() => go(0)}
                  onBusyChange={setDiscovering}
                  onPlan={(p) => {
                    setPlan(p)
                    go(2)
                  }}
                />
              )}
              {step === 2 && plan && (
                <StepReview
                  onBusyChange={setDiscovering}
                  plan={plan}
                  setPlan={setPlan}
                  prompt={discoveryRequest(prompt, csv)}
                  budget={draft.budget}
                  onBack={() => go(1)}
                  onNext={() => go(3)}
                />
              )}
              {step === 3 && plan && (
                <StepCheckout
                  plan={plan}
                  draft={draft}
                  existingId={existing?.id}
                  prompt={prompt}
                  onPayingChange={setPaying}
                  onPaymentComplete={setPaymentComplete}
                  onBack={() => go(2)}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </section>
      </main>
    </div>
  )
}
