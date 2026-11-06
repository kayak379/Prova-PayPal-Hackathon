# Deploy Prova on Render

The app uses one shared PostgreSQL workspace and one team login. The first database setup inserts the organization, three folders, and three sample campaigns. Future deployments preserve all edits. Browser local storage is used only for the theme.

## Recommended: deploy the Blueprint

1. Commit the application changes, including package.json, pnpm-lock.yaml, pnpm-workspace.yaml, db/, scripts/, proxy.ts, and render.yaml, and push them to your GitHub repository. Do not commit .env.local.
2. In the Render dashboard, select **New → Blueprint** and connect that repository and branch. Render reads render.yaml and creates the prova web service and prova-db database in Ohio.
3. Review the resources before creating them. This configuration uses a **paid Starter web service** and the smallest paid PostgreSQL compute plan with 1 GB storage. Render shows the current charges. The paid web service supports the pre-deploy database setup command.
4. Supply these environment variables when prompted:

| Variable | Value |
| --- | --- |
| DEMO_EMAIL | Email your team will use to sign in |
| DEMO_PASSWORD | Password your team will use to sign in |
| PAYPAL_CLIENT_ID | Your PayPal **sandbox** app client ID |
| PAYPAL_CLIENT_SECRET | Matching sandbox secret |
| CHANNEL3_API_KEY | Your existing Channel3 key |
| OPENROUTER_API_KEY | Your existing OpenRouter key |
| GEMINI_API_KEY | Your Gemini key for AI fallback, if available |

The Blueprint connects DATABASE_URL to the database's internal connection string and generates SESSION_SECRET. Do not replace these with browser-visible variables. The AI model settings have defaults in render.yaml.

5. Create the resources. The build installs dependencies and builds Next.js. The pre-deploy command runs pnpm db:setup to apply migrations and seed only an uninitialized workspace. The start command listens on Render's assigned PORT.
6. Open the web service URL, visit /login, and sign in with DEMO_EMAIL and DEMO_PASSWORD. You should see all three sample campaigns.
7. Create a new campaign, reload, and sign in from a second browser to verify shared persistence. Restart the web service and confirm the campaign remains.
8. For a PayPal walkthrough, create a **new campaign**, generate a proposal, and use a sandbox buyer account. Sample campaigns and synthetic purchase IDs cannot initiate PayPal operations. The demo can preload an already-approved sandbox wallet: set PAYPAL_DEFAULT_VAULT_WALLET to the encrypted reference from the local setup, using the same PAYPAL_CLIENT_SECRET. The next pre-deploy imports it into PostgreSQL once and fills the organization PayPal email. Subsequent redeploys preserve wallet changes and do not reconnect a deliberately removed wallet. Keep this reference in Render secrets, never source control. Existing local campaigns are not imported.

## Manual setup or an existing Render service

Create Render PostgreSQL and a Node Web Service in the **same region**. Connect the repository and use:

- Build command: corepack pnpm install --frozen-lockfile --prod=false && corepack pnpm build
- Pre-deploy command (paid web service): corepack pnpm db:setup
- Start command: corepack pnpm start --hostname 0.0.0.0 --port $PORT
- Node version: 24.22.1
- DATABASE_URL: the PostgreSQL **internal** connection URL
- SESSION_SECRET: at least 32 random characters; generate with node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
- All login and provider environment variables listed above

For a **free web service**, leave pre-deploy blank and use this build command instead:

corepack pnpm install --frozen-lockfile --prod=false && corepack pnpm db:setup && corepack pnpm build

Select the database plan you want in the dashboard and review its current limits. The checked-in Blueprint deliberately uses paid resources; change its plans before creating it if you prefer another setup.

Render supplies RENDER_EXTERNAL_URL automatically. If you add a custom domain, set APP_URL=https://your-domain.example and use that domain consistently when signing in and starting PayPal flows. This controls same-origin checks and callback URLs behind Render's HTTPS proxy.

## PayPal webhook activation and reconciliation

Register `https://prova-ddm2.onrender.com/api/paypal/webhook` in the same PayPal sandbox app used by the web service, and set `PAYPAL_WEBHOOK_ID` on that service. The web service's existing pre-deploy command applies the webhook inbox migration.

Reconciliation is currently **manual only**: use the campaign's Reconcile control, ask the finance assistant to reconcile, or run `pnpm paypal:reconcile` in the Render service shell. No scheduled job is active.

`render-reconciliation.yaml` is an optional, unapplied template for a cron job every ten minutes in Ohio. It references the existing `prova` service's database URL and PayPal credentials without storing secrets in source. Its draft Render Blueprint has automatic syncing disabled and has not been approved, so it creates no running service or charges. Applying it later would require approving Render's plan and paid cron billing.

## Local development and checks

Use Node 24 and the pinned pnpm version. Copy .env.example to .env.local and fill in its database, login, session, and provider values. For local PostgreSQL, use your local connection URL. To access a Render database from your computer, use its external URL with the TLS settings Render provides; internal URLs only work on Render's private network.

Run:

~~~sh
pnpm install --frozen-lockfile
pnpm db:setup
pnpm dev
~~~

Checks:

~~~sh
pnpm typecheck
pnpm test
pnpm build
~~~

The integration tests use an embedded PostgreSQL engine (PGlite), with mocked PayPal HTTP responses. They do not contact your live database or PayPal account. A real Render deployment and sandbox payment still need the smoke test above.

## Resetting for another demo

In the Render web service Shell, run:

~~~sh
pnpm db:reset --confirm-reset
~~~

This explicitly deletes **all workspace campaigns, settings, payment recovery records, and saved wallet references** and restores the samples. It does not cancel, refund, or delete anything at PayPal. Do not run it while a payment or finance operation is pending. Regular deployments never reset data.

## Troubleshooting

- **Sign-in unavailable:** check DEMO_EMAIL, DEMO_PASSWORD, SESSION_SECRET and DATABASE_URL, then check pre-deploy logs for Database ready.
- **Database connection timeout:** ensure the app and database are in the same region and DATABASE_URL uses the internal URL.
- **Invalid request origin:** use the Render public URL, or set APP_URL to your custom domain. Avoid switching domains midway through login or payment approval.
- **Campaign changed in another browser:** the server rejected a stale edit. Review the refreshed data before retrying the intended change.
- **Checkout interrupted:** reopen the campaign and its Checkout step. Resume approval or verify the saved payment; PostgreSQL retains the recovery ticket.
- **Sample proposal has no Pay button:** it has no signed live price snapshot. Create a new campaign and generate a proposal for a sandbox checkout.
- **Wallet unavailable after changing PAYPAL_CLIENT_SECRET:** saved wallet references are encrypted using that secret. Reconnect the wallet in Organization settings.

This deployment has a shared team identity and PayPal sandbox fulfillment. It does not provide individual accounts or organization isolation.

Render references: [Next.js hosting](https://render.com/docs/deploy-nextjs-app), [PostgreSQL connections](https://render.com/docs/postgresql-creating-connecting), [Blueprint fields](https://render.com/docs/blueprint-spec), [pre-deploy commands](https://render.com/docs/deploys#pre-deploy-command).
