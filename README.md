# Prova hackathon MVP

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
