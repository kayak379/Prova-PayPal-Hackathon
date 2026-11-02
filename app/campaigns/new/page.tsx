import type { Metadata } from 'next'
import { CampaignWizard } from '@/components/wizard/campaign-wizard'

export const metadata: Metadata = { title: 'New campaign — Prova' }

export default async function NewCampaignPage({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string }>
}) {
  const { campaign } = await searchParams
  return <CampaignWizard key={campaign ?? 'new'} existingId={campaign} />
}
