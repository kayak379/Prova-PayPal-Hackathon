import type { Metadata } from 'next'
import { CampaignDetail } from '@/components/campaign/campaign-detail'
import { TopBar } from '@/components/top-bar'

export const metadata: Metadata = { title: 'Campaign — Prova' }

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <>
      <TopBar />
      <CampaignDetail id={id} />
    </>
  )
}
