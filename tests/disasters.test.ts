import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import type { Pool } from 'pg'
import { NextRequest } from 'next/server'
import { proxy } from '../proxy'
import { distanceMiles, proactiveDefaults } from '../lib/proactive'
import type { DisasterEvent, Settings } from '../lib/types'
import { mutate, workspace } from '../lib/server/workspace'
import { parseDisaster, validDisasterToken, receiveDisaster, claimDisaster, processDisaster, publishDisaster, renewDisaster, retryDisaster, listDisasters } from '../lib/server/disasters'
import { POST as webhook, OPTIONS as webhookOptions } from '../app/api/disasters/webhook/route'
import { POST as createCheckout } from '../app/api/checkout/create/route'
import { sign, verify } from '../lib/server/common'
import { campaignEvidence } from '../lib/server/evidence'

const event: DisasterEvent = { source: 'Recorded disaster fixture', eventId: 'flood-1', type: 'flood', title: 'Flood near shelter', description: 'Flooding reported. Prepare practical supplies.',
  latitude: 38.846, longitude: -76.93, occurredAt: '2026-11-07T10:00:00Z', updatedAt: '2026-11-07T11:00:00Z', sourceUrl: 'https://example.org/event' }

test('coordinates, distance, payload validation and secret checks', () => {
  assert.equal(distanceMiles(event, event), 0)
  assert.ok(Math.abs(distanceMiles({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }) - 69.0934) < .001)
  assert.ok(Number.isFinite(distanceMiles({ latitude: 90, longitude: 180 }, { latitude: -90, longitude: -180 })))
  assert.equal(parseDisaster(event).title, event.title)
  for (const patch of [{ latitude: 91 }, { longitude: '1' }, { latitude: NaN }, { updatedAt: 'yesterday' }, { sourceUrl: 'javascript:alert(1)' }, { description: '' }]) {
    assert.throws(() => parseDisaster({ ...event, ...patch }))
  }
  process.env.DISASTER_WEBHOOK_SECRET = 'test-disaster-secret'
  assert.equal(validDisasterToken(null), false)
  assert.equal(validDisasterToken('Bearer wrong'), false)
  assert.equal(validDisasterToken('Bearer test-disaster-secret'), true)
  const url = 'https://demo.example/api/disasters'
  assert.equal(proxy(new NextRequest(url)).status, 401)
  assert.equal(proxy(new NextRequest(url, { method: 'POST', headers: { origin: 'https://evil.example' } })).status, 403)
  assert.equal(proxy(new NextRequest(url + '/webhook', { method: 'POST' })).status, 200)
  assert.equal(proxy(new NextRequest(url + '/webhook', { method: 'OPTIONS', headers: { origin: 'null' } })).status, 200)
  assert.equal(webhookOptions().status, 204)
  assert.equal(webhookOptions().headers.get('Access-Control-Allow-Origin'), '*')
})

test('persistent proactive workflow', async t => {
  const db = new PGlite()
  process.env.DATABASE_URL = 'postgres://test'
  process.env.PAYPAL_CLIENT_SECRET = 'test-signing-key'
  process.env.DISASTER_WEBHOOK_SECRET = 'test-disaster-secret'
  const query = (sql: string, params?: unknown[]) => db.query(sql, params)
  const client = { query, release() {} }
  ;(globalThis as unknown as { provaPool: Pool }).provaPool = { query, connect: async () => client } as unknown as Pool
  await db.exec(await readFile('db/migrations/001_workspace.sql', 'utf8'))
  await db.exec(await readFile('db/migrations/004_sandbox_payouts.sql', 'utf8'))
  await db.exec(await readFile('db/migrations/006_proactive_disasters.sql', 'utf8'))
  await db.exec(await readFile('db/migrations/007_campaign_evidence.sql', 'utf8'))
  const base: Settings = { orgName: 'Relief', address: '4600 Silver Hill Rd, Washington, DC 20233', taxId: 'test', proactive: { ...proactiveDefaults('relief'), enabled: true },
    shippingLocation: { address: '4600 Silver Hill Rd, Washington, DC 20233', matchedAddress: '4600 SILVER HILL RD', latitude: event.latitude, longitude: event.longitude } }
  await db.query("INSERT INTO workspace(id,settings,folders) VALUES('demo',$1,$2)", [JSON.stringify(base), JSON.stringify([{ id: 'relief', name: 'Relief' }])])
  const setSettings = async (settings: Settings) => db.query("UPDATE workspace SET settings=$1 WHERE id='demo'", [JSON.stringify(settings)])
  const row = async (id: string) => (await db.query<any>('SELECT * FROM disaster_events WHERE id=$1', [id])).rows[0]
  const originalFetch = globalThis.fetch
  const interpretation = { title: 'Prepared flood response', summary: 'Supplies for reported flooding.', prompt: 'Supply flood relief for 200 people for 3 days.' }
  const items = [1, 2, 3, 4].map(n => ({ id: `product-${n}`, name: `Supply ${n}`, supplier: 'lowes.com', category: 'Relief', unitPrice: 10, unitPriceCents: 1000, qty: 1, delivery: 'Delivery unverified' }))
  const plan = { items, shipping: 2, tax: 3.2, discount: 0, reasoning: [], snapshot: sign({ kind: 'prices', products: items, budgetCents: 1000000, expires: Date.now() + 86400000 }) }
  try {
    await t.test('webhook validates authentication and bounded bodies before persistence', async () => {
      const request = (payload: unknown, secret = 'test-disaster-secret') => new Request('https://demo.example/api/disasters/webhook', { method: 'POST', headers: { authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      assert.equal((await webhook(request(event, 'wrong'))).status, 401)
      assert.equal((await webhook(request(event, 'wrong'))).headers.get('Access-Control-Allow-Origin'), '*')
      assert.equal((await webhook(request({ ...event, latitude: 999 }))).status, 400)
      assert.equal((await webhook(request({ ...event, description: 'a'.repeat(33000) }))).status, 413)
      assert.equal((await webhook(request(event))).status, 202)
      assert.equal((await webhook(request(event))).status, 202)
      assert.equal((await db.query<any>('SELECT * FROM disaster_events')).rows.length, 1)
    })
    await t.test('one claim and atomic campaign publication with no payment calls', async () => {
      const job = await claimDisaster()
      assert.ok(job)
      assert.equal(await claimDisaster(), null)
      assert.equal(await renewDisaster({ ...job, token: 'wrong' }), false)
      assert.equal(await renewDisaster(job), true)
      globalThis.fetch = async () => { throw new Error('No external calls expected for injected planning') }
      await processDisaster(job, { interpret: async () => interpretation, discover: async () => plan })
      assert.equal((await row(job.id)).status, 'ready')
      assert.equal(await publishDisaster(job, interpretation, plan), false)
      const w = await workspace()
      assert.equal(w.campaigns.length, 1)
      assert.equal(w.campaigns[0].orders.length, 0)
      assert.equal(w.campaigns[0].disaster?.event.eventId, event.eventId)
      const evidence = await campaignEvidence(w.campaigns[0].id)
      assert.equal(evidence.verification.valid, true)
      assert.equal(evidence.bundle.records[0].event.source, 'disaster-worker')
      const older = { ...event, title: 'Old title', updatedAt: '2026-11-07T10:00:00Z' }
      await receiveDisaster(older)
      assert.equal((await row(job.id)).event.title, event.title)
      await receiveDisaster({ ...event, title: 'Updated report', updatedAt: '2026-11-07T12:00:00Z' })
      assert.equal((await row(job.id)).event.title, 'Updated report')
      assert.equal((await workspace()).campaigns.length, 1)
      assert.equal((await listDisasters())[0].total, 45.2)
      assert.equal((await db.query<any>('SELECT * FROM payment_attempts')).rows.length, 0)
    })
    await t.test('disabled, outside-radius, inclusive boundary and newer ignored updates', async () => {
      await setSettings({ ...base, proactive: { ...base.proactive!, enabled: false } })
      const ignored = await receiveDisaster({ ...event, eventId: 'disabled' })
      assert.equal(ignored.status, 'ignored')
      await setSettings(base)
      assert.equal((await receiveDisaster({ ...event, eventId: 'disabled' })).status, 'ignored')
      assert.equal((await receiveDisaster({ ...event, eventId: 'disabled', updatedAt: '2026-11-07T12:00:00Z' })).status, 'queued')
      await db.query("UPDATE disaster_events SET status='ignored' WHERE id=$1", [ignored.id])
      assert.equal((await receiveDisaster({ ...event, eventId: 'far', latitude: 0, longitude: 0 })).status, 'ignored')
      const boundary = { ...event, eventId: 'boundary', latitude: event.latitude + 1 }
      await setSettings({ ...base, proactive: { ...base.proactive!, radiusMiles: distanceMiles(base.shippingLocation!, boundary) } })
      const accepted = await receiveDisaster(boundary)
      assert.equal(accepted.status, 'queued')
      await db.query("UPDATE disaster_events SET status='ignored' WHERE id=$1", [accepted.id])
      await setSettings(base)
    })
    await t.test('expired leases reclaim work and reject the old owner', async () => {
      await receiveDisaster({ ...event, eventId: 'recovery' })
      const first = (await claimDisaster())!
      await db.query("UPDATE disaster_events SET lease_until=now()-interval '1 second' WHERE id=$1", [first.id])
      assert.equal(await publishDisaster(first, interpretation, plan), false)
      const second = (await claimDisaster())!
      assert.equal(first.id, second.id)
      assert.notEqual(first.token, second.token)
      assert.equal(second.attempts, 2)
      assert.equal(await publishDisaster(first, interpretation, plan), false)
      assert.equal(await publishDisaster(second, interpretation, plan), true)
    })
    await t.test('campaign and ready status roll back together if linking fails', async () => {
      await receiveDisaster({ ...event, eventId: 'rollback' })
      const job = (await claimDisaster())!
      const count = (await workspace()).campaigns.length
      await db.exec(`CREATE FUNCTION reject_ready() RETURNS trigger AS $$ BEGIN
        IF NEW.status = 'ready' THEN RAISE EXCEPTION 'Simulated linkage failure'; END IF;
        RETURN NEW; END; $$ LANGUAGE plpgsql;
        CREATE TRIGGER reject_ready BEFORE UPDATE ON disaster_events FOR EACH ROW EXECUTE FUNCTION reject_ready();`)
      await assert.rejects(publishDisaster(job, interpretation, plan), /Simulated linkage failure/)
      assert.equal((await workspace()).campaigns.length, count)
      assert.equal((await row(job.id)).status, 'processing')
      await db.exec('DROP TRIGGER reject_ready ON disaster_events; DROP FUNCTION reject_ready();')
      assert.equal(await publishDisaster(job, interpretation, plan), true)
      assert.equal((await workspace()).campaigns.length, count + 1)
    })
    await t.test('three interrupted claims stop retrying and a disabled queued job cannot run', async () => {
      const eventRow = await receiveDisaster({ ...event, eventId: 'interrupted' })
      for (let attempt = 1; attempt <= 3; attempt++) {
        const job = (await claimDisaster())!
        assert.equal(job.id, eventRow.id)
        assert.equal(job.attempts, attempt)
        await db.query("UPDATE disaster_events SET lease_until=now()-interval '1 second' WHERE id=$1", [job.id])
      }
      assert.equal(await claimDisaster(), null)
      assert.equal((await row(eventRow.id)).status, 'failed')
      const queued = await receiveDisaster({ ...event, eventId: 'disable-before-claim' })
      await setSettings({ ...base, proactive: { ...base.proactive!, enabled: false } })
      assert.equal(await claimDisaster(), null)
      assert.equal((await row(queued.id)).status, 'cancelled')
      await assert.rejects(retryDisaster(queued.id), /Enable proactive/)
      await setSettings(base)
    })
    await t.test('settings changes including off/on cancel in-flight results', async () => {
      for (const patch of [{ address: 'New address' }, { proactive: { ...base.proactive!, enabled: false } }, { proactiveRevision: 2 }, { proactive: { ...base.proactive!, budget: 2000 } }]) {
        await setSettings(base)
        await receiveDisaster({ ...event, eventId: crypto.randomUUID() })
        const job = (await claimDisaster())!
        await setSettings({ ...base, ...patch })
        assert.equal(await publishDisaster(job, interpretation, plan), false)
        assert.equal((await row(job.id)).status, 'cancelled')
      }
      await setSettings(base)
    })
    await t.test('three failed attempts then explicit retry', async () => {
      const delivery = await receiveDisaster({ ...event, eventId: 'retry' })
      for (let attempt = 1; attempt <= 3; attempt++) {
        const job = (await claimDisaster())!
        assert.equal(job.id, delivery.id)
        await processDisaster(job, { interpret: async () => { throw new Error('Transient provider error') }, discover: async () => plan })
        assert.equal((await row(job.id)).status, attempt < 3 ? 'queued' : 'failed')
        await db.query('UPDATE disaster_events SET next_attempt_at=now() WHERE id=$1', [job.id])
      }
      await retryDisaster(delivery.id)
      const job = (await claimDisaster())!
      assert.equal(job.attempts, 1)
      await processDisaster(job, { interpret: async () => interpretation, discover: async () => ({ ...plan, mock: true }) })
      assert.equal((await listDisasters()).find(r => r.id === job.id)?.mock, true)
      await assert.rejects(retryDisaster(job.id), /Only failed/)
    })
    await t.test('geocoding is cached, server-owned, and invalid addresses cannot enable processing', async () => {
      await setSettings({ ...base, proactive: { ...base.proactive!, enabled: false }, shippingLocation: undefined })
      const save = async (changes: Partial<Settings>) => {
        const w = await workspace()
        return mutate({ kind: 'settings', version: w.version, settings: { ...w.settings, ...changes } })
      }
      let lookups = 0
      globalThis.fetch = async url => {
        assert.match(String(url), /geocoding.geo.census.gov/)
        lookups++
        return Response.json({ result: { addressMatches: [{ matchedAddress: 'Matched shelter address', coordinates: { x: event.longitude, y: event.latitude } }] } })
      }
      await save({ proactive: base.proactive })
      assert.equal(lookups, 1)
      const matched = (await workspace()).settings.shippingLocation
      assert.equal(matched?.matchedAddress, 'Matched shelter address')
      await save({ shippingLocation: { ...matched!, latitude: 0 } })
      assert.equal(lookups, 1)
      assert.equal((await workspace()).settings.shippingLocation?.latitude, event.latitude)
      const originalRevision = (await workspace()).settings.proactiveRevision
      await save({ address: '  4600 Silver Hill Rd  \n Washington , dc20233  ' })
      assert.equal((await workspace()).settings.address, base.address)
      assert.equal(lookups, 1, 'Equivalent formatting keeps the verified location')
      assert.equal((await workspace()).settings.proactiveRevision, originalRevision)
      await save({ address: '4600 Silver Hill Rd\n Apt 4B\nWashington dc20233' })
      const formatted = (await workspace()).settings
      assert.equal(formatted.address, '4600 Silver Hill Rd, Apt 4B, Washington, DC 20233')
      assert.equal(formatted.shippingLocation?.address, formatted.address)
      assert.equal(lookups, 2, 'Changed address is geocoded before proactive work resumes')
      const formattedEvent = await receiveDisaster({ ...event, eventId: 'formatted-address' })
      assert.equal(formattedEvent.status, 'queued')
      const formattedJob = (await claimDisaster())!
      assert.equal(formattedJob.snapshot.address, formatted.address)
      assert.equal(await publishDisaster(formattedJob, interpretation, plan), true)
      assert.equal((await workspace()).campaigns.find(c => c.disaster?.event.eventId === 'formatted-address')?.address, formatted.address)
      await save({ address: base.address })
      const revision = (await workspace()).settings.proactiveRevision!
      await save({ orgName: 'Renamed relief organization' })
      assert.equal((await workspace()).settings.proactiveRevision, revision, 'Unrelated settings must not cancel prepared work')
      await save({ proactive: { ...base.proactive!, enabled: false } })
      await save({ proactive: base.proactive })
      assert.equal((await workspace()).settings.proactiveRevision, revision + 2)
      globalThis.fetch = async () => Response.json({ result: { addressMatches: [] } })
      await assert.rejects(save({ address: 'Not a valid U.S. address' }), /complete, unambiguous/)
      assert.equal((await workspace()).settings.address, base.address)
      await save({ address: 'New unverified address', proactive: { ...base.proactive!, enabled: false } })
      assert.equal((await workspace()).settings.shippingLocation, undefined)
      await assert.rejects(save({ proactive: base.proactive }), /complete, unambiguous/)
      assert.equal((await workspace()).settings.proactive?.enabled, false)
      await setSettings(base)
    })
    await t.test('real interpreter and discovery orchestration creates a signed reviewable plan, never payments', async () => {
      let models = 0
      globalThis.fetch = async (url, options) => {
        const target = String(url)
        assert.doesNotMatch(target, /paypal/i)
        if (target.includes('channel3')) return Response.json({ products: items.map(item => ({ id: item.id, title: item.name, offers: [{ domain: item.supplier, url: `https://lowes.com/p/${item.id}`, availability: 'InStock', price: { currency: 'USD', price: 10 } }] })) })
        assert.match(target, /openrouter/)
        const body = JSON.parse(String(options?.body))
        models++
        const result = models === 1 ? { ...interpretation, needs: 'Clean water, blankets, first aid and hygiene supplies.' } : models === 2 ? { queries: ['emergency supplies'], reasoning: [] } : { items: items.map((item, i) => ({ id: `p${i + 1}`, qty: 1, explanation: 'Supports people affected by flooding.' })), reasoning: [] }
        if (models === 1) assert.match(body.messages[0].content, /planning assumptions/)
        return Response.json({ choices: [{ message: { content: JSON.stringify(result) } }] })
      }
      process.env.OPENROUTER_API_KEY = 'test-model'
      process.env.CHANNEL3_API_KEY = 'test-catalog'
      const delivery = await receiveDisaster({ ...event, eventId: 'real-flow' })
      await processDisaster((await claimDisaster())!)
      const saved = await row(delivery.id)
      assert.equal(saved.status, 'ready', saved.error)
      assert.equal(models, 3)
      const campaign = (await workspace()).campaigns.find(c => c.id === saved.campaign_id)!
      assert.equal(campaign.orders.length, 0)
      const prices = verify<{ expires: number }>(campaign.proposal!.snapshot!)
      assert.ok(prices.expires > Date.now())
      const expired = sign({ kind: 'prices', products: items, budgetCents: 1000000, expires: Date.now() - 1000 })
      await mutate({ kind: 'proposal', id: campaign.id, version: campaign.version, request: campaign.request, proposal: { ...campaign.proposal, snapshot: expired } })
      const response = await createCheckout(new Request('https://demo.example/api/checkout/create', { method: 'POST', body: JSON.stringify({ campaignId: campaign.id, snapshot: expired, items: [{ id: items[0].id, qty: 1 }] }) }))
      assert.equal(response.status, 400)
      assert.match((await response.json()).error, /expired/)
    })
  } finally { globalThis.fetch = originalFetch; await db.close(); delete (globalThis as any).provaPool }
})
