# Prova hackathon MVP

## Demo flow

1. Build a proposal, then request a specific revision such as “halve the water quantity; keep everything else.” Review the item changes, unchanged item count, and exact before/after totals. Revision failures preserve the request for retry, and checkout is disabled while revising.
2. Complete PayPal sandbox checkout. The verified receipt shows the approved amount, completed capture, order/capture references, and remaining campaign budget. Fulfillment is simulated. The verified receipt is saved before its recovery ticket is removed.
3. Choose **Manage payment & refunds** to open Finance. **Prepare a refund with the assistant** fills an editable request for up to $5 from the latest purchase; review it and choose **Ask assistant**. PayPal revalidates the refundable amount. Confirm the action card to submit the sandbox refund, then inspect its returned status, refund/capture references, net spending, and remaining budget. Pending refunds do not restore budget; use **Refresh refund status** to recheck. Failed requests retain the same pending operation for retry.

Run `node --test tests/checkout.test.cjs tests/finance.test.cjs tests/discovery.test.cjs tests/product-selection.test.mjs tests/request-attachment.test.cjs` and `pnpm exec tsc --noEmit` to verify the demo flows without moving money.

Run `pnpm install`, copy `.env.example` to `.env.local`, fill in the API credentials, then run `pnpm dev`. Open http://localhost:3000.

Create a campaign, describe the emergency, build a proposal, adjust quantities or request a revision, then approve the proposal and continue to PayPal sandbox. Sign in with a **personal sandbox buyer account**, distinct from the sandbox business merchant configured in `.env.local`. After approval, the app verifies capture and records a receipt. If interrupted, reopen the campaign wizard and verify or resume the pending checkout.

Campaigns, requests, proposals, receipts, folders and organization settings are saved in browser localStorage. No database or real authentication is used. Keep the same browser and hostname throughout checkout. Clearing browser storage removes this workspace.

## Integrations

- OpenRouter defaults to `nvidia/nemotron-3.5-super-vl:free`; set `OPENROUTER_MODEL` to change it. Two model calls identify needs and select products. An invalid selection gets one repair attempt.
- Channel3 product search uses up to six queries with at most three concurrent searches. Only USD offers with known prices are selected. Stock for bulk quantities and delivery dates are not verified.
- PayPal Agent Toolkit creates, retrieves and captures one sandbox order. All products are paid to the configured test merchant. No retailer orders are placed and no goods ship.
- Shipping is estimated at 5% and tax at 8%. The sandbox PayPal order includes estimated tax as a separate line to avoid per-unit tax rounding differences in the toolkit.
- API keys remain on the server. Signed price snapshots expire after 24 hours. Payment tickets bind the cart, campaign and amount to a PayPal order. This is a local hackathon demo, not a production financial ledger; browser campaign budgets are not independently durable or authoritative across devices.

## API

- `POST /api/discovery`: `{ prompt, budget, feedback?, currentPlan? }`; returns newline-delimited JSON stage events followed by `{ plan }` or `{ error }`.
- `POST /api/checkout/create`: `{ campaignId, snapshot, items: [{ id, qty }] }`; returns a sandbox approval URL, order ID and signed payment ticket.
- `POST /api/checkout/capture`: `{ orderId, ticket }`; verifies or captures the approved order and returns `{ campaignId, receipt }`. Repeated verification returns the same receipt; the browser deduplicates by PayPal order ID.

New product prices and payment totals use integer cents internally; dollar fields are retained for the existing presentation components.

Check types with `pnpm exec tsc --noEmit`. Build with `pnpm build` (or `pnpm exec next build --webpack` if the local Turbopack CSS worker fails).

Checkout uses the PayPal sandbox v6 SDK in modal mode. Settings saves a PayPal wallet through Vault after one-time payer consent. Buyer passwords are not stored or sent by the app. Existing saved proposals retain their previous suppliers until rebuilt. Revisions apply explicit product edits and preserve unrelated items; over-budget edits are rejected without modifying the original proposal.

### Saved PayPal wallet

Organization settings → Save PayPal uses the Payment Method Tokens v3 API: create a setup token, obtain payer consent through the in-page PayPal Save session, then exchange it for a payment token. The app stores the wallet reference in an encrypted HttpOnly cookie for 30 days; it does not store the buyer password or expose the vault ID to JavaScript. Vault must be enabled for the sandbox app. Change saved PayPal connects another account; Remove saved PayPal revokes its payment token.

After the user approves a proposal, checkout uses the saved wallet through the Orders API with a persisted idempotency key, then verifies the captured amount. Standard unsaved-wallet purchases still use PayPal Agent Toolkit. PayPal may request additional payer action; the modal handles that when required. Wallet saving itself takes no payment.

If the AI API fails (including rate limits, timeouts, or unusable selection output), discovery returns a clearly labeled mock proposal with sample suppliers and prices. The mock flag is signed into checkout data and carried into sandbox receipts and order history. Failed AI revisions preserve the current proposal and explicitly state that requested changes were not applied. Input validation and supplier API errors still surface as errors.

Each failed OpenRouter request now gets up to 3 total attempts (initial request plus 2 retries), waiting 1 second and then 2 seconds. Progress reports the retry attempt. Mock fallback is used only after those attempts fail; a successful retry continues with live discovery. Product-selection repair remains a separate step.

AI provider order: OpenRouter (up to 3 attempts) -> Gemini (up to 3 attempts) -> labeled mock data. Gemini uses the server-side GEMINI_API_KEY and GEMINI_MODEL (default gemini-3.5-flash). After switching, the rest of that discovery/revision run stays on Gemini. Google currently routes gemini-3.5-flash to gemini-3.6-flash; the configured request ID remains gemini-3.5-flash.

## Campaign funding, refunds and finance assistant

Campaign details now has **Funding** and **Finance** tabs. Existing records need no migration; new finance collections default to empty arrays. Everything remains in the shared browser workspace and PayPal sandbox.

- Funding: choose a saved proposal or purchase, select item quantities, enter a sponsor name and optional email, review, and confirm. This creates a draft invoice, persists it, publishes it, then retrieves its payment link and QR. Email is off by default. Select **Email invoice to sponsor through PayPal** to require a sponsor email and show that recipient in the confirmation. Publication requests the sponsor notification through PayPal (`send_to_recipient: true`); merchant notifications stay disabled. Refreshing an already published invoice does not resend email. The app records a notification request, not confirmed email delivery; sandbox behavior may differ from real email delivery. QR/publication errors can be retried on the same invoice. Funding covers merchandise only, excludes shipping/tax, and does not increase the purchasing budget. Refresh status to record actual received funding; unpaid invoices count as zero.
- Orders: expand a purchase to prepare a full remaining or exact USD partial refund. Confirm the amount to refund Prova’s sandbox merchant payment. This does not cancel a retailer order. Only completed refunds reduce net spending and restore the campaign’s remaining budget. Pending/failed refunds do not.
- Finance: verify orders, refunds and invoices against PayPal. Supplementary transaction reporting can lag or be unavailable and is not used to declare a missing payment. The overview and export include these finance records.
- Assistant: ask payment questions or request an invoice/refund preparation. Native OpenRouter/Gemini function calling chooses campaign-scoped read tools and preparation tools. The assistant can prepare an emailed invoice when explicitly requested with a sponsor email. Only confirmation cards can execute writes. Each message is limited to four model rounds/eight tool executions. Provider failure never fabricates financial success; guided controls remain available.

`POST /api/finance` supports `prepare`, `confirm`, `invoice` (optional publish), `refund` status, and `reconcile`, with the browser campaign context. `POST /api/finance/chat` accepts campaign, text and message history. Action tokens bind campaign, source, amount and operation ID and expire after 15 minutes. Pending operation IDs persist before writes; PayPal request IDs provide idempotency. The server revalidates source prices/captures and signs invoice/refund references. There is no production account isolation or durable server ledger in this demo.

Verification uses `node --test tests/finance.test.cjs tests/discovery.test.cjs tests/product-selection.test.mjs` and `pnpm exec tsc --noEmit`. A $2 sandbox invoice was published with a working QR/link and no email; a $1 sandbox partial refund against the designated demo purchase completed and was recovered without a duplicate refund. Sponsor payment verification requires paying the invoice with a sandbox buyer account distinct from the merchant.

Invoice email regression tests cover required recipients, signed notification preferences, recipient mismatch rejection, default notification suppression, and no duplicate send after QR failure or refresh. Email-enabled publication is tested with mocked PayPal responses; no test emails were sent.
