# Sandbox retailer payouts

Checkout captures one sandbox buyer payment, then sends a sandbox payout batch
with one recipient per retailer. It does not place retailer orders or arrange
delivery. No live payment endpoint is used.

## Setup

1. Run `pnpm db:setup` against the intended database to apply migrations and import
   the ten sandbox retailer recipients. This also runs automatically before a
   Render deployment. Existing recipient mappings are preserved; subsequent
   deployments preserve deliberate edits and removals.
2. In the PayPal Developer Dashboard, use the sandbox app's client ID and secret
   for `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`. Ensure the app has Payouts
   access and the sending sandbox business account has enough test balance for
   the payout total and fees.
3. Default test recipients cover Lowe's, Home Depot, Grainger, Uline, Zoro,
   Walmart, Amazon, Costco, Sam's Club and Global Industrial. These are simulated
   retailer accounts, not the retailers' real PayPal accounts. For other domains,
   add a sandbox business email in Prova's account settings. Use the domains shown
   in the proposal, such as `example.com`.
4. Complete checkout normally with a sandbox buyer account. The same approval
   authorizes the automatic retailer payouts. Test shipping and tax are allocated
   proportionally; payout fees are paid by the sending sandbox account.

Recipients and amounts are frozen when checkout starts. Settings edits apply to
future checkout attempts. Existing purchases and seeded sample campaigns do not
receive payouts retroactively.

## Status and recovery

The receipt briefly refreshes payout progress. Expanded campaign purchases show
the per-retailer statuses. A pending or failed payout does not undo the buyer's
verified payment. Do not repeat checkout to retry a payout.

Use the existing finance reconciliation action or `pnpm paypal:reconcile` to
recover committed payout intents and refresh PayPal batch/item results. Lost
responses reuse the original batch identifier. Definitively rejected batches
and failed individual payouts are not automatically resent. Ambiguous requests
older than 29 days require manual review in the sandbox account because PayPal's
duplicate protection has a limited lifetime.

Refunding a purchase returns the buyer's capture; it does not reverse retailer
payouts. Unsent payouts on refunded purchases are held for review.
