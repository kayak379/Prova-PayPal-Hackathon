import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto'
import type { Campaign } from '../types'
import type { EvidenceBundle, EvidenceCheckpoint, EvidenceEvent, EvidenceRecord, EvidenceVerification } from '../evidence'

// RFC 8785 ordering and JSON primitive serialization for persisted JSON values.
// Reject non-JSON values instead of silently hashing a different representation.
export function canonicalize(value: unknown): string {
  if (typeof value === 'string' && !value.isWellFormed()) throw new Error('Evidence requires valid Unicode strings.')
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']'
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return '{' + Object.keys(value).sort().map(key => canonicalize(key) + ':' + canonicalize((value as Record<string, unknown>)[key])).join(',') + '}'
  }
  throw new Error('Evidence requires finite JSON values.')
}

export const hashEvidence = (value: unknown) => createHash('sha256').update(canonicalize(value), 'utf8').digest('hex')

// Commit to action credentials and attachment contents without distributing them.
// Wallets, session secrets and provider credentials are never campaign fields.
export function evidenceState(campaign: Campaign): unknown {
  const { version: _version, ...state } = campaign
  return JSON.parse(JSON.stringify(state, (key, value) => {
    if (typeof value === 'string' && ['token', 'proof', 'snapshot', 'content'].includes(key)) {
      return { sha256: hashEvidence(value) }
    }
    return value
  }))
}

function checkpointMessage(event: EvidenceEvent, hash: string) {
  return Buffer.from(canonicalize({ format: 'prova-evidence-checkpoint-v1', campaignId: event.campaignId, sequence: event.sequence, hash }))
}

export function signCheckpoint(event: EvidenceEvent, hash: string): EvidenceCheckpoint | null {
  const configured = process.env.EVIDENCE_SIGNING_PRIVATE_KEY
  if (!configured) return null
  // PEM with escaped newlines, or base64 PKCS#8 DER for single-line env settings.
  const key = configured.includes('PRIVATE KEY')
    ? createPrivateKey(configured.replace(/\\n/g, '\n'))
    : createPrivateKey({ key: Buffer.from(configured, 'base64'), format: 'der', type: 'pkcs8' })
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('EVIDENCE_SIGNING_PRIVATE_KEY must be an Ed25519 private key.')
  const publicKey = createPublicKey(key).export({ type: 'spki', format: 'pem' }).toString()
  return {
    algorithm: 'Ed25519', publicKey, keyId: hashEvidence(publicKey),
    signature: sign(null, checkpointMessage(event, hash), key).toString('base64'),
  }
}

export function verifyRecords(bundle: EvidenceBundle, trustedPublicKey?: string): EvidenceVerification {
  const records = bundle?.records
  const result: EvidenceVerification = { valid: false, count: Array.isArray(records) ? records.length : 0, headHash: null, signed: false, keyId: null, baseline: false }
  try {
    if (bundle.format !== 'prova-evidence-export-v1' || !Array.isArray(records) || !records.length) throw new Error('No evidence recorded.')
    let previous: EvidenceRecord | undefined
    for (const record of records) {
      const event = record.event
      if (event.format !== 'prova-evidence-v1' || event.campaignId !== bundle.campaignId ||
          event.sequence !== (previous?.event.sequence ?? 0) + 1 || event.previousHash !== (previous?.hash ?? null)) {
        throw new Error(`Evidence link or sequence mismatch at event ${event.sequence}.`)
      }
      if (record.hash !== hashEvidence(event) || event.stateHash !== hashEvidence(event.state)) throw new Error(`Evidence hash mismatch at event ${event.sequence}.`)
      if (record.checkpoint) {
        const checkpoint = record.checkpoint
        const key = createPublicKey(checkpoint.publicKey)
        if (checkpoint.algorithm !== 'Ed25519' || key.asymmetricKeyType !== 'ed25519' ||
            checkpoint.keyId !== hashEvidence(checkpoint.publicKey) ||
            !verify(null, checkpointMessage(event, record.hash), key, Buffer.from(checkpoint.signature, 'base64'))) {
          throw new Error(`Invalid checkpoint signature at event ${event.sequence}.`)
        }
      }
      previous = record
    }
    const last = records[records.length - 1]
    if (bundle.head.sequence !== last.event.sequence || bundle.head.hash !== last.hash) throw new Error('Evidence head mismatch; events may be missing.')
    if (trustedPublicKey) {
      const normalized = createPublicKey(trustedPublicKey).export({ type: 'spki', format: 'pem' }).toString()
      if (!last.checkpoint || last.checkpoint.publicKey !== normalized) throw new Error('Latest checkpoint is not signed by the trusted key.')
    }
    return { ...result, valid: true, headHash: last.hash, signed: !!last.checkpoint, keyId: last.checkpoint?.keyId ?? null, baseline: records[0].event.type === 'history.baseline' }
  } catch (error) {
    return { ...result, error: error instanceof Error ? error.message : 'Invalid evidence.' }
  }
}
