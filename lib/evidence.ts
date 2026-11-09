// Portable format shared by the API, UI and offline verifier. No secrets here.
export type EvidenceContext = {
  type: string
  source: 'shared-account' | 'server' | 'disaster-worker' | 'paypal-webhook' | 'migration' | 'demo'
  details?: unknown
  eventId?: string
}

export type EvidenceEvent = {
  format: 'prova-evidence-v1'
  campaignId: string
  sequence: number
  eventId: string
  recordedAt: string
  type: string
  source: EvidenceContext['source']
  details: unknown
  previousHash: string | null
  stateHash: string
  state: unknown
}

export type EvidenceCheckpoint = {
  algorithm: 'Ed25519'
  keyId: string
  publicKey: string
  signature: string
}

export type EvidenceRecord = { event: EvidenceEvent; hash: string; checkpoint: EvidenceCheckpoint | null }
export type EvidenceVerification = {
  valid: boolean
  count: number
  headHash: string | null
  signed: boolean
  keyId: string | null
  baseline: boolean
  error?: string
}
export type EvidenceBundle = {
  format: 'prova-evidence-export-v1'
  exportedAt: string
  campaignId: string
  head: { sequence: number; hash: string | null }
  records: EvidenceRecord[]
}

export type EvidenceView = {
  verification: EvidenceVerification
  campaignVersion: number
  checkedAt: string
  latestRecord: EvidenceRecord | null
  records: (EvidenceRecord & { changedFields: string[]; coveredBySequence: number | null })[]
  page: number
  pages: number
  total: number
}
