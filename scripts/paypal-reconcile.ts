import './env'
import { database } from '../lib/server/db'
import { processWebhook } from '../lib/server/paypal-webhooks'
import { withCampaign } from '../lib/server/workspace'
import { reconcile } from '../lib/server/finance'
import { applyFinance } from '../lib/server/finance-persistence'
import { processPayouts } from '../lib/server/payouts'

async function main() {
  let failures = 0
  // Process a bounded batch, prioritizing less-retried verified deliveries so
  // permanently unmatched resources cannot starve newer events.
  // Re-running is safe: row locks and processed_at protect concurrent runners.
  const pending = await database().query(`
    SELECT id FROM paypal_webhook_events WHERE processed_at IS NULL ORDER BY attempts,received_at LIMIT 100
  `)
  for (const { id } of pending.rows) {
    try { await processWebhook(id) }
    catch (error) {
      failures++
      console.error('Webhook still pending:', id, error instanceof Error ? error.message : 'error')
    }
  }
  // Poll known resources even when PayPal never delivered an event. Include
  // archived campaigns so deleting a campaign cannot hide a late payment.
  const campaigns = await database().query("SELECT id FROM campaigns WHERE COALESCE((data->>'demo')::boolean,false)=false ORDER BY id")
  for (const { id } of campaigns.rows) {
    try {
      const result = await withCampaign(id, async (campaign, client) => {
        const result = await reconcile(campaign, client)
        applyFinance(campaign, result)
        return result
      }, true, { type: 'paypal.reconciled', source: 'server' })
      const payoutOrders = await processPayouts(id)
      for (const order of payoutOrders) {
        if (order.payouts?.error || ['FAILED', 'PARTIAL', 'NEEDS_REVIEW'].includes(order.payouts?.status || '')) {
          failures++
          console.error('Retailer payouts:', order.id, order.payouts?.status, order.payouts?.error || '')
        }
      }
      const uncertain = result.verification.findings.filter(f => /unavailable|mismatch/i.test(f))
      if (uncertain.length) { failures++; console.error(id, uncertain.join('; ')) }
      else console.log('Reconciled campaign:', id)
    } catch (error) {
      failures++
      console.error('Campaign reconciliation failed:', id, error instanceof Error ? error.message : 'error')
    }
  }
  console.log(`PayPal reconciliation finished: ${campaigns.rows.length} campaigns, ${pending.rows.length} pending events, ${failures} unresolved checks.`)
  if (failures) process.exitCode = 1
}

main().catch(error => { console.error(error); process.exitCode = 1 })
  .finally(async () => { if (process.env.DATABASE_URL) await database().end() })
