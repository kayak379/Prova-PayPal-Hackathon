import type { PoolClient } from 'pg'
import type { RetailerRecipient } from '../lib/types'
import { retailerRecipients } from '../lib/retailer-payouts'

// Import only once so future deployments preserve intentional edits/removals.
export async function bootstrapRetailers(client: Pick<PoolClient, 'query'>, defaults: RetailerRecipient[]) {
  const row = (await client.query("SELECT settings, retailer_recipients_bootstrapped FROM workspace WHERE id='demo' FOR UPDATE")).rows[0]
  if (!row || row.retailer_recipients_bootstrapped) return
  const existing = retailerRecipients(row.settings.retailerRecipients)
  const configured = new Set(existing.map(recipient => recipient.domain))
  const recipients = [...existing, ...retailerRecipients(defaults).filter(recipient => !configured.has(recipient.domain))]
  await client.query(`UPDATE workspace SET settings=jsonb_set(settings,'{retailerRecipients}',$1::jsonb),
    retailer_recipients_bootstrapped=true,version=version+1 WHERE id='demo'`, [JSON.stringify(recipients)])
}
