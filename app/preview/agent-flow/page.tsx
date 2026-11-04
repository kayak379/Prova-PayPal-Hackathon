import { notFound } from 'next/navigation'
import { AgentFlowPreview } from '@/components/wizard/agent-flow-preview'

export default function AgentFlowPreviewPage() {
  if (process.env.NODE_ENV !== 'development') notFound()
  return <AgentFlowPreview />
}
