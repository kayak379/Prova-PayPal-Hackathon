import type { PoolClient } from 'pg'
import { database, transaction } from './db'
import type { Campaign, Settings, Folder } from '../types'
import { campaignSpent } from '../format'
export type Workspace = { settings: Settings; folders: Folder[]; campaigns: Campaign[]; version: number }
export class Conflict extends Error {}
export async function workspace(): Promise<Workspace> {
  const result = await database().query("SELECT settings, folders, version FROM workspace WHERE id='demo'")
  if (!result.rows[0]) throw new Error('Run database setup before starting the app.')
  const campaigns = await database().query("SELECT data, version FROM campaigns WHERE NOT (data ? 'deletedAt') ORDER BY (data->>'createdAt')::bigint DESC")
  return { ...result.rows[0], campaigns: campaigns.rows.map(row => ({ ...row.data, version: row.version })) }
}
export async function campaign(client: PoolClient, id: string, includeDeleted = false): Promise<Campaign> {
  const result = await client.query("SELECT data, version FROM campaigns WHERE id=$1 AND ($2::boolean OR NOT (data ? 'deletedAt')) FOR UPDATE", [id, includeDeleted])
  if (!result.rows[0]) throw new Error('Campaign not found.')
  return { ...result.rows[0].data, version: result.rows[0].version }
}
export async function saveCampaign(client: PoolClient, c: Campaign) {
  const { version, ...data } = c
  await client.query('UPDATE campaigns SET data=$2, version=version+1 WHERE id=$1', [c.id, JSON.stringify(data)])
}
export async function withCampaign<T>(id: string, work: (c: Campaign, client: PoolClient) => Promise<T>, includeDeleted = false) {
  return transaction(async client => {
    const c = await campaign(client, id, includeDeleted)
    const result = await work(c, client)
    await saveCampaign(client, c)
    return result
  })
}
const text = (value: unknown, max = 500) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('Invalid text field.')
  return value.trim()
}
function fields(input: any, folders: Folder[], spent = 0) {
  if (!Number.isFinite(input.budget) || input.budget <= 0 || input.budget < spent) throw new Error('Invalid campaign budget.')
  if (!folders.some(f => f.id === input.folderId)) throw new Error('Choose an existing folder.')
  return { name: text(input.name, 160), budget: input.budget, folderId: input.folderId }
}
export async function mutate(input: any) {
  return transaction(async client => {
    const row = (await client.query("SELECT * FROM workspace WHERE id='demo' FOR UPDATE")).rows[0]
    if (!row) throw new Error('Workspace not initialized.')
    let entity: unknown
    if (input.kind === 'create' || input.kind === 'folder') {
      if (typeof input.entityId !== 'string' || !/^[a-f0-9-]{36}$/.test(input.entityId)) throw new Error('Invalid creation ID.')
    }
    if (input.kind === 'folder') {
      const existing = row.folders.find((f: Folder) => f.id === input.entityId)
      if (existing) return existing
      entity = { id: input.entityId, name: text(input.name, 160) }
      await client.query("UPDATE workspace SET folders=folders || $1::jsonb, version=version+1 WHERE id='demo'", [JSON.stringify([entity])])
    } else if (input.kind === 'settings') {
      if (input.version !== row.version) throw new Conflict('Settings changed in another browser. Reload and try again.')
      const settings = { orgName: text(input.settings.orgName), taxId: String(input.settings.taxId || '').slice(0, 100), address: String(input.settings.address || '').slice(0, 1000), paypalEmail: String(input.settings.paypalEmail || '').slice(0, 320) }
      await client.query("UPDATE workspace SET settings=$1, version=version+1 WHERE id='demo'", [JSON.stringify(settings)])
    } else if (input.kind === 'create') {
      const existing = await client.query('SELECT data FROM campaigns WHERE id=$1', [input.entityId])
      if (existing.rows[0]) return existing.rows[0].data
      const c: Campaign = { ...fields(input.draft, row.folders), id: input.entityId, taxId: String(input.draft.taxId || '').slice(0, 100), address: String(input.draft.address || '').slice(0, 1000), createdAt: Date.now(), orders: [], audit: [{ id: crypto.randomUUID(), at: Date.now(), actor: 'user', message: 'Campaign created' }] }
      await client.query('INSERT INTO campaigns(id,data) VALUES($1,$2)', [c.id, JSON.stringify(c)])
      entity = c
    } else {
      const c = await campaign(client, text(input.id), input.kind === 'delete')
      if (input.kind === 'delete' && c.deletedAt) return
      if (input.version !== c.version) throw new Conflict('Campaign changed in another browser. Reload and try again.')
      if (input.kind === 'delete') {
        c.deletedAt = Date.now()
        c.audit.push({ id: crypto.randomUUID(), at: Date.now(), actor: 'user', message: 'Campaign deleted from workspace' })
      } else if (input.kind === 'campaign') Object.assign(c, fields(input.changes, row.folders, campaignSpent(c)))
      else if (input.kind === 'proposal') {
        if (typeof input.request !== 'string' || input.request.length > 100000) throw new Error('Invalid request.')
        if (input.proposal && (!Array.isArray(input.proposal.items) || input.proposal.items.length > 48)) throw new Error('Invalid proposal.')
        c.request = input.request; c.proposal = input.proposal
        if (input.attachment !== undefined) c.requestAttachment = input.attachment
      } else if (input.kind === 'finance') {
        if (input.patch.financeMessages) c.financeMessages = input.patch.financeMessages
        if (input.patch.financeOperations) c.financeOperations = input.patch.financeOperations
      } else if (input.kind === 'audit') c.audit.push({ id: crypto.randomUUID(), at: Date.now(), actor: 'user', message: text(input.entry.message, 2000) })
      else throw new Error('Unknown workspace operation.')
      await saveCampaign(client, c)
    }
    return entity
  })
}
