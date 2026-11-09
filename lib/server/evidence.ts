import type { PoolClient } from 'pg'
import type { Campaign } from '../types'
import type { EvidenceBundle, EvidenceContext, EvidenceEvent, EvidenceRecord } from '../evidence'
import { evidenceState, hashEvidence, signCheckpoint, verifyRecords } from './evidence-crypto'
import { transaction } from './db'

type Client = Pick<PoolClient, 'query'>
type CampaignRow = { data: Campaign; evidence_sequence: number; evidence_hash: string | null }
export class EvidenceConflict extends Error {}

export async function assertEvidence(client: Client, row: CampaignRow) {
  const last = (await client.query('SELECT event,hash,checkpoint FROM campaign_evidence WHERE campaign_id=$1 ORDER BY sequence DESC LIMIT 1', [row.data.id])).rows[0] as EvidenceRecord | undefined
  if (!last && row.evidence_sequence === 0 && row.evidence_hash === null) return
  if (!last || last.event.sequence !== row.evidence_sequence || last.hash !== row.evidence_hash ||
      last.hash !== hashEvidence(last.event) || last.event.stateHash !== hashEvidence(evidenceState(row.data))) {
    throw new EvidenceConflict('Campaign evidence does not match the saved campaign. Verification is required.')
  }
}

// All callers hold the campaign row lock in the same transaction as the mutation.
export async function recordEvidence(client: Client, campaignId: string, context: EvidenceContext, next?: Campaign) {
  const row = (await client.query('SELECT data,evidence_sequence,evidence_hash FROM campaigns WHERE id=$1 FOR UPDATE', [campaignId])).rows[0] as CampaignRow | undefined
  if (!row) throw new Error('Campaign not found.')
  await assertEvidence(client, row)
  if (row.evidence_sequence === 0 && context.type !== 'campaign.created' && context.type !== 'history.baseline') {
    await recordEvidence(client, campaignId, { type: 'history.baseline', source: 'migration', details: { notice: 'Existing state recorded now. Earlier activity was not cryptographically witnessed.' } })
    return recordEvidence(client, campaignId, context, next)
  }
  const eventId = context.eventId ?? crypto.randomUUID()
  if ((await client.query('SELECT sequence FROM campaign_evidence WHERE campaign_id=$1 AND event_id=$2', [campaignId, eventId])).rows.length) return
  const state = evidenceState(next ?? row.data)
  const event: EvidenceEvent = {
    format: 'prova-evidence-v1', campaignId, sequence: row.evidence_sequence + 1, eventId,
    recordedAt: new Date().toISOString(), type: context.type, source: context.source,
    details: context.details ?? null, previousHash: row.evidence_hash,
    stateHash: hashEvidence(state), state,
  }
  const hash = hashEvidence(event)
  await client.query('INSERT INTO campaign_evidence(campaign_id,sequence,event_id,hash,event,checkpoint) VALUES($1,$2,$3,$4,$5,$6)',
    [campaignId, event.sequence, eventId, hash, JSON.stringify(event), JSON.stringify(signCheckpoint(event, hash))])
  await client.query('UPDATE campaigns SET evidence_sequence=$2,evidence_hash=$3 WHERE id=$1', [campaignId, event.sequence, hash])
}

export async function baselineEvidence(client: Client) {
  const rows = (await client.query('SELECT id FROM campaigns WHERE evidence_sequence=0 ORDER BY id FOR UPDATE')).rows
  for (const row of rows) await recordEvidence(client, row.id, { type: 'history.baseline', source: 'migration', details: { notice: 'Existing state recorded now. Earlier activity was not cryptographically witnessed.' } })
}

export async function campaignEvidence(id: string) {
  return transaction(async client => {
    // One lock gives verification/export a consistent campaign and chain snapshot.
    const row = (await client.query('SELECT data,version,evidence_sequence,evidence_hash FROM campaigns WHERE id=$1 FOR UPDATE', [id])).rows[0]
    if (!row) throw new Error('Campaign not found.')
    const records = (await client.query('SELECT event,hash,checkpoint FROM campaign_evidence WHERE campaign_id=$1 ORDER BY sequence', [id])).rows as EvidenceRecord[]
    const bundle: EvidenceBundle = {
      format: 'prova-evidence-export-v1', exportedAt: new Date().toISOString(), campaignId: id,
      head: { sequence: row.evidence_sequence, hash: row.evidence_hash }, records,
    }
    const verification = verifyRecords(bundle)
    if (verification.valid && records[records.length - 1].event.stateHash !== hashEvidence(evidenceState(row.data))) {
      verification.valid = false
      verification.error = 'Saved campaign differs from the latest evidence record.'
    }
    return { bundle, verification, campaignVersion: row.version }
  })
}
