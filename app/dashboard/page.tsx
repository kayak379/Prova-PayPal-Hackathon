import type { Metadata } from 'next'
import { Dashboard } from '@/components/dashboard/dashboard'
import { TopBar } from '@/components/top-bar'

export const metadata: Metadata = { title: 'Campaigns — Prova' }

export default function DashboardPage() {
  return (
    <>
      <TopBar />
      <Dashboard />
    </>
  )
}
