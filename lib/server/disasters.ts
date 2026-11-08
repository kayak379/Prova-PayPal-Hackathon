import { timingSafeEqual } from 'node:crypto'
import type { Campaign, DisasterEvent, Plan, ProactiveResponse, ResponseSnapshot, Settings } from '../types'
import { distanceMiles } from '../proactive'
import { totalsCents } from '../money'
import { database, transaction } from './db'
import { discover } from './discovery'
import { interpretDisaster } from './disaster-agent'
import { message } from './common'

export function validDisasterToken(header: string | null) {
  const secret = process.env.DISASTER_WEBHOOK_SECRET
  if (!secret || !header?.startsWith('Bearer ')) return false
  const actual = Buffer.from(header.slice(7)), expected = Buffer.from(secret)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function parseDisaster(input: unknown): DisasterEvent {
  if (!input || typeof input !== 'object') throw new Error('Expected a disaster event object.')
  const raw = input as Record<string, unknown>
  const text = (name: string, max: number) => {
    const value = raw[name]
    if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`Invalid ${name}.`)
    return value.trim()
  }
  const date = (name: string) => {
    const value = text(name, 50)
    if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error(`Invalid ${name}; use an ISO timestamp with timezone.`)
    return new Date(value).toISOString()
  }
  if (typeof raw.latitude !== 'number' || !Number.isFinite(raw.latitude) || Math.abs(raw.latitude) > 90 ||
    typeof raw.longitude !== 'number' || !Number.isFinite(raw.longitude) || Math.abs(raw.longitude) > 180) throw new Error('Invalid disaster coordinates.')
  let sourceUrl: string | undefined
  if (raw.sourceUrl !== undefined) {
    sourceUrl = text('sourceUrl', 2000)
    if (new URL(sourceUrl).protocol !== 'https:') throw new Error('Source URL must use HTTPS.')
  }
  return { source: text('source', 120), eventId: text('eventId', 200), updatedAt: date('updatedAt'), occurredAt: date('occurredAt'),
    type: text('type', 100), title: text('title', 300), description: text('description', 10000), latitude: raw.latitude, longitude: raw.longitude, sourceUrl }
}

export function responseSnapshot(settings: Settings): ResponseSnapshot | null {
  if (!settings.proactive?.enabled || !settings.shippingLocation || settings.shippingLocation.address !== settings.address) return null
  return { address: settings.address, taxId: settings.taxId, proactive: settings.proactive, location: settings.shippingLocation, revision: settings.proactiveRevision ?? 0 }
}

function snapshotKey(snapshot: ResponseSnapshot | null) {
  if (!snapshot) return 'disabled'
  const { proactive: p, location: l } = snapshot
  // JSONB does not retain object key order; compare explicit values instead.
  return JSON.stringify([snapshot.address, snapshot.taxId, snapshot.revision, p.enabled, p.radiusMiles, p.budget, p.people, p.days, p.folderId, l.address, l.matchedAddress, l.latitude, l.longitude])
}

function eligibility(event: DisasterEvent, settings: Settings) {
  const snapshot = responseSnapshot(settings)
  const distance = snapshot ? distanceMiles(snapshot.location, event) : null
  const eligible = snapshot && distance !== null && distance <= snapshot.proactive.radiusMiles
  return { snapshot, distance, status: eligible ? 'queued' : 'ignored', progress: !snapshot ? 'Proactive campaigns disabled or location unavailable' : eligible ? 'Waiting for response worker' : 'Outside response radius' }
}

export async function receiveDisaster(event: DisasterEvent) {
  return transaction(async client => {
    // All paths lock workspace before jobs to keep ingestion, publishing and settings consistent.
    const settings = (await client.query("SELECT settings FROM workspace WHERE id='demo' FOR UPDATE")).rows[0]?.settings
    if (!settings) throw new Error('Workspace not initialized.')
    const e = eligibility(event, settings)
    const id = crypto.randomUUID()
    await client.query(`INSERT INTO disaster_events(id,source,event_id,event,event_updated_at,status,progress,distance_miles)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(source,event_id) DO NOTHING`,
    [id, event.source, event.eventId, JSON.stringify(event), event.updatedAt, e.status, e.progress, e.distance])
    const row = (await client.query('SELECT * FROM disaster_events WHERE source=$1 AND event_id=$2 FOR UPDATE', [event.source, event.eventId])).rows[0]
    if (Date.parse(event.updatedAt) > new Date(row.event_updated_at).getTime()) {
      const ignored = row.status === 'ignored'
      await client.query(`UPDATE disaster_events SET event=$2,event_updated_at=$3,updated_at=now(),
        status=$4,progress=$5,distance_miles=$6 WHERE id=$1`,
      [row.id, JSON.stringify(event), event.updatedAt, ignored ? e.status : row.status, ignored ? e.progress : row.progress, ignored ? e.distance : row.distance_miles])
      if (ignored) row.status = e.status
    }
    return { id: row.id as string, status: row.status as ProactiveResponse['status'] }
  })
}

export async function listDisasters(): Promise<ProactiveResponse[]> {
  const result = await database().query(`SELECT d.*,c.data AS campaign FROM disaster_events d
    LEFT JOIN campaigns c ON c.id=d.campaign_id
    WHERE d.status <> 'ignored' AND NOT COALESCE(c.data ? 'deletedAt',false)
    ORDER BY d.created_at DESC LIMIT 50`)
  return result.rows.map(row => ({ id: row.id, event: row.event, status: row.status, progress: row.progress, error: row.error ?? undefined,
    distanceMiles: row.distance_miles ?? undefined, campaignId: row.campaign_id ?? undefined, snapshot: row.snapshot ?? undefined,
    total: row.campaign?.proposal ? totalsCents(row.campaign.proposal.items).total / 100 : undefined, mock: row.campaign?.proposal?.mock }))
}

export async function retryDisaster(id: string) {
  return transaction(async client => {
    const settings = (await client.query("SELECT settings FROM workspace WHERE id='demo' FOR UPDATE")).rows[0]?.settings
    const row = (await client.query('SELECT * FROM disaster_events WHERE id=$1 FOR UPDATE', [id])).rows[0]
    if (!row || !['failed', 'cancelled'].includes(row.status) || row.campaign_id) throw new Error('Only failed or cancelled responses can be retried.')
    const e = eligibility(row.event, settings)
    if (e.status !== 'queued') throw new Error('Enable proactive campaigns and ensure this event is within the current radius before retrying.')
    await client.query(`UPDATE disaster_events SET status='queued',attempts=0,error=NULL,progress=$2,next_attempt_at=now(),
      snapshot=NULL,claim_token=NULL,lease_until=NULL,distance_miles=$3,updated_at=now() WHERE id=$1`, [id, e.progress, e.distance])
  })
}

export type DisasterJob = { id: string; event: DisasterEvent; snapshot: ResponseSnapshot; distance: number; token: string; attempts: number }

export async function claimDisaster(): Promise<DisasterJob | null> {
  return transaction(async client => {
    const settings = (await client.query("SELECT settings FROM workspace WHERE id='demo' FOR UPDATE")).rows[0]?.settings
    if (!settings) throw new Error('Run db:setup before starting the worker.')
    await client.query(`UPDATE disaster_events SET status='failed',error='Worker interrupted after three attempts',progress='Response needs retry',claim_token=NULL,lease_until=NULL
      WHERE status='processing' AND lease_until < now() AND attempts >= 3`)
    const row = (await client.query(`SELECT * FROM disaster_events WHERE campaign_id IS NULL AND attempts < 3 AND
      ((status='queued' AND next_attempt_at <= now()) OR (status='processing' AND lease_until < now()))
      ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED`)).rows[0]
    if (!row) return null
    const e = eligibility(row.event, settings)
    if (e.status !== 'queued') {
      await client.query("UPDATE disaster_events SET status='cancelled',progress=$2,error='Response settings changed; retry explicitly',claim_token=NULL,lease_until=NULL WHERE id=$1", [row.id, e.progress])
      return null
    }
    const token = crypto.randomUUID()
    await client.query(`UPDATE disaster_events SET status='processing',attempts=attempts+1,claim_token=$2,
      lease_until=now()+interval '90 seconds',snapshot=$3,distance_miles=$4,progress='Interpreting disaster report',error=NULL,updated_at=now() WHERE id=$1`,
    [row.id, token, JSON.stringify(e.snapshot), e.distance])
    return { id: row.id, event: row.event, snapshot: e.snapshot!, distance: e.distance!, token, attempts: row.attempts + 1 }
  })
}

export async function renewDisaster(job: DisasterJob) {
  const result = await database().query(`UPDATE disaster_events SET lease_until=now()+interval '90 seconds'
    WHERE id=$1 AND claim_token=$2 AND status='processing' AND lease_until > now() RETURNING id`, [job.id, job.token])
  return result.rows.length > 0
}

export async function publishDisaster(job: DisasterJob, interpretation: { title: string; summary: string; prompt: string }, plan: Plan) {
  return transaction(async client => {
    const settings = (await client.query("SELECT settings FROM workspace WHERE id='demo' FOR UPDATE")).rows[0]?.settings
    const row = (await client.query("SELECT * FROM disaster_events WHERE id=$1 AND claim_token=$2 AND status='processing' AND lease_until > now() FOR UPDATE", [job.id, job.token])).rows[0]
    if (!row) return false
    if (snapshotKey(responseSnapshot(settings)) !== snapshotKey(job.snapshot)) {
      await client.query("UPDATE disaster_events SET status='cancelled',error='Response settings changed; retry explicitly',progress='Response cancelled',claim_token=NULL,lease_until=NULL WHERE id=$1", [job.id])
      return false
    }
    const campaign: Campaign = {
      id: crypto.randomUUID(), name: interpretation.title, folderId: job.snapshot.proactive.folderId,
      budget: job.snapshot.proactive.budget, taxId: job.snapshot.taxId, address: job.snapshot.address, createdAt: Date.now(), orders: [],
      request: interpretation.prompt, proposal: plan,
      disaster: { event: job.event, distanceMiles: job.distance, assumptions: job.snapshot, summary: interpretation.summary },
      audit: [{ id: crypto.randomUUID(), at: Date.now(), actor: 'agent', message: `Prepared from ${job.event.source} event ${job.event.eventId}. ${job.snapshot.proactive.people} people / ${job.snapshot.proactive.days} days are planning assumptions. Human approval required before payment.` }],
    }
    await client.query('INSERT INTO campaigns(id,data) VALUES($1,$2)', [campaign.id, JSON.stringify(campaign)])
    await client.query("UPDATE disaster_events SET status='ready',campaign_id=$2,progress=$3,error=NULL,claim_token=NULL,lease_until=NULL,updated_at=now() WHERE id=$1", [job.id, campaign.id, plan.mock ? 'Demo proposal — review required' : 'Supply plan ready for review'])
    return true
  })
}

type JobDependencies = { interpret: typeof interpretDisaster; discover: typeof discover }
export async function processDisaster(job: DisasterJob, dependencies: JobDependencies = { interpret: interpretDisaster, discover }) {
  let lost = false
  let heartbeat: Promise<void> = Promise.resolve()
  const timer = setInterval(() => {
    heartbeat = heartbeat.then(async () => { if (!await renewDisaster(job)) lost = true }).catch(() => { lost = true })
  }, 20000)
  const progressWrites: Promise<unknown>[] = []
  try {
    const interpretation = await dependencies.interpret(job.event, job.snapshot)
    if (lost) return
    const plan = await dependencies.discover({ prompt: interpretation.prompt, budget: job.snapshot.proactive.budget }, (_stage, detail) => {
      progressWrites.push(database().query("UPDATE disaster_events SET progress=$3,updated_at=now() WHERE id=$1 AND claim_token=$2 AND status='processing' AND lease_until > now()", [job.id, job.token, detail]).catch(() => { lost = true }))
    })
    await Promise.all(progressWrites)
    await heartbeat
    if (!lost) await publishDisaster(job, interpretation, plan)
  } catch (error) {
    await Promise.all(progressWrites)
    await database().query(`UPDATE disaster_events SET status=$3,error=$4,progress=$5,claim_token=NULL,lease_until=NULL,
      next_attempt_at=now()+($6 * interval '1 second'),updated_at=now()
      WHERE id=$1 AND claim_token=$2 AND status='processing' AND lease_until > now()`,
    [job.id, job.token, job.attempts >= 3 ? 'failed' : 'queued', message(error).slice(0, 2000), job.attempts >= 3 ? 'Response needs retry' : 'Retrying response after an error', job.attempts * 10])
  } finally {
    clearInterval(timer)
    await heartbeat
  }
}
