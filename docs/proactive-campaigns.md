# Proactive disaster responses

The webhook supports browser CORS preflight for a standalone HTML demo sender, including files opened locally. POST still requires the bearer secret. The HTML sender is distributed separately from this repository; never embed or save the real secret in that file.

Prova can receive disaster updates and prepare supply campaigns while no browser is open. The webhook is an ingestion contract, not a live disaster-feed subscription. Connect a sender separately. The standalone demo HTML is intentionally deferred.

## Run locally

1. Configure the existing database, model and Channel3 variables in `.env.local`. `PAYPAL_CLIENT_SECRET` is also required in the worker because existing discovery signs price snapshots with it.
2. Generate a random server-only `DISASTER_WEBHOOK_SECRET` and add it to `.env.local`. Do not use a `NEXT_PUBLIC_` variable or commit the value.
3. Run `pnpm db:setup`, then `pnpm dev`. In a second terminal run `pnpm disasters:worker`.
4. Sign in and open Account settings. Enter a complete U.S. default shipping address. Enable **Proactive campaigns**, choose the radius, budget, people, days and folder, then save. Address validation uses the U.S. Census geocoder and displays the matched address on reopening settings. An unmatched address cannot enable processing.
5. Send the sample request below. Coordinates describe the event location; the shipping address is the center of the response radius. The sample coordinates are near the Census address `4600 Silver Hill Rd, Washington, DC 20233`.

```powershell
# Use the same secret configured on the web server. Keep it out of source control.
$disasterSecret = Read-Host 'Disaster webhook secret'
$disasterEvent = @{
  source = 'Hackathon event replay'
  eventId = 'demo-flood-001'
  updatedAt = [DateTime]::UtcNow.ToString('o')
  occurredAt = [DateTime]::UtcNow.ToString('o')
  type = 'flood'
  title = 'Demo: flooding near the response center'
  description = 'Recorded demo input: flooding has displaced households. Prepare water, hygiene, first aid and shelter supplies. Local needs and delivery availability need confirmation.'
  latitude = 38.846
  longitude = -76.930
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'http://localhost:3000/api/disasters/webhook' `
  -Headers @{ Authorization = "Bearer $disasterSecret" } `
  -ContentType 'application/json' -Body $disasterEvent
```

The endpoint returns HTTP 202 with `{ id, status }` after the event is saved. A matching event is queued; disabled and outside-radius deliveries are saved as ignored. JSON bodies are limited to 32 KiB. Event IDs are namespaced by source; timestamps must include a timezone. Optional `sourceUrl` must be HTTPS and is displayed as a reference, never fetched by the worker.

Repeated or older updates do nothing. Newer updates refresh the event record. An ignored event can become eligible on a newer update, but an existing campaign is never regenerated automatically. Use a new event ID to demonstrate a separate disaster. Failed/cancelled jobs have an authenticated **Retry response** control.

## Review and payment

The dashboard polls visible-page status every three seconds. Watch interpretation and discovery progress, then select **Review supplies**. Source, distance and planning assumptions appear alongside the existing proposal review. Review quantities and changes before continuing to checkout. Expired proposals require refresh; refresh can change products or quantities and must be reviewed again. Discovery's mock fallback is explicitly labeled **Demo proposal**.

The worker never creates PayPal orders or sends financial writes. Payment requires the existing human checkout flow. People and duration are saved organization assumptions, not confirmed affected population; a nearby event does not establish specific local needs or fulfillment availability.

## Queue and deployment

`disaster_events` is both the delivery inbox and durable queue. The worker processes one job at a time with atomic claims, a 90-second lease, and a heartbeat every 20 seconds. Only a current claim owner can publish; campaign creation and event linkage commit in one transaction. Expired claims can be reclaimed. Errors retry up to three job attempts with 10/20-second delays, then require explicit retry. Model calls also retain their existing bounded provider retries.

Turning proactive mode off prevents publication of in-flight work. Changing the address, tax ID or proactive defaults invalidates in-flight results even if settings are changed back. Existing campaigns remain accessible. No ignored backlog is automatically replayed when enabling the setting.

The main Render Blueprint now includes a `prova-disaster-worker` in Ohio using the existing database and shared model/catalog/signing configuration. Both services run the idempotent migration setup before deployment. Applying it provisions an additional worker; this change does not deploy anything by itself. The worker stops claiming jobs on SIGTERM/SIGINT and drains its current job; forced termination is recovered through the lease. No Redis service is required.

Monitor worker logs and dashboard failed/queued states. A queued response that never progresses usually means the worker is stopped or cannot connect to the database. `GET /api/disasters` and retry `POST /api/disasters` require the existing signed-in session; only the exact external webhook POST bypasses cookie/origin checks and instead requires its bearer secret.

## Demo walkthrough

Enable proactive mode, leave the dashboard open, and send the recorded demo event from another terminal. Show the campaign appearing without typing a supply request. Open its prepared plan, explain its source and assumptions, edit an item, and continue to the existing PayPal Sandbox approval screen. Only confirm a sandbox purchase when deliberately demonstrating payment. Retry the same event to demonstrate deduplication; send a distant location under a new ID to demonstrate filtering.
