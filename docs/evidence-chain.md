# Campaign evidence

The campaign's **Audit log** tab contains **Verify evidence** and **Export evidence**. Verification reads the server's current state; the existing **Export campaign** button continues to export the browser's campaign view. Evidence exports contain the ordered evidence records and a saved head, including when verification fails, so an investigator can inspect the failure.

## Setup

Run `pnpm db:setup` before starting the updated app and worker. Migration `007_campaign_evidence.sql` adds an append-only evidence table and a sequence/hash pointer to each campaign. Setup records one `history.baseline` event for each preexisting campaign, including archived campaigns, using the time of migration. It preserves the campaign's original timestamps and labels its earlier history as unwitnessed. Repeated setup does not recreate baselines. New sample campaigns are explicitly marked synthetic.

Hash verification works without extra configuration. For signatures, generate a dedicated Ed25519 key on a trusted machine:

```sh
node -e "const c=require('node:crypto'),k=c.generateKeyPairSync('ed25519'); console.log('EVIDENCE_SIGNING_PRIVATE_KEY='+k.privateKey.export({type:'pkcs8',format:'der'}).toString('base64')); console.log(k.publicKey.export({type:'spki',format:'pem'}).toString())"
```

Store the private output securely as the server-only `EVIDENCE_SIGNING_PRIVATE_KEY` environment variable in the web service, disaster worker, database setup and reconciliation processes. Copy the public PEM to a separate trusted file, such as `evidence-public.pem`. Do not commit the private key, place it in a `NEXT_PUBLIC_` variable, or reuse PayPal/session credentials. The setting also accepts PKCS#8 PEM with real newlines or literal `\n` escapes. An absent key produces explicitly unsigned events; an invalid configured key fails the transaction rather than silently dropping signatures.

Signing begins with the next evidence event. A signature over the latest hash commits to its entire preceding chain, including any unsigned baseline. Read-only verification/export never generates a signature or rewrites history. If signing is enabled after an unsigned baseline, the next campaign mutation creates a signed checkpoint. Ensure every writer has the key; otherwise its latest event will be unsigned. Key rotation changes the signer on future events, preserving old public keys and signatures in previous events. Retain the old trusted public key and checkpoint externally before rotation, distribute the new trusted public key independently, and compare exports across the rotation.

## Independent verification

Download an export, then run:

```sh
pnpm evidence:verify campaign-evidence.json
pnpm evidence:verify campaign-evidence.json evidence-public.pem
pnpm evidence:verify latest.json evidence-public.pem earlier.json
```

The first command checks hashes, sequence, links, embedded signatures and the exported head. The second additionally requires the latest checkpoint to match the independently trusted public key. The third also requires the current history to extend the head of an earlier retained export, detecting truncation, rollback and replacement relative to that checkpoint. Exit code 1 means verification failed. Public keys included in an export alone do not establish the export's origin. Export files contain campaign information; retain them in a location with appropriate access controls.

## Format and coverage

`prova-evidence-export-v1` contains `campaignId`, `exportedAt`, `head` (`sequence`, `hash`), and `records`. Each record contains an `event`, its SHA-256 `hash`, and an optional Ed25519 `checkpoint`. Each `prova-evidence-v1` event includes its campaign ID, sequence, unique event ID, server recording time, type, source, details, previous event hash, projected campaign state, and state hash. The export time and informational verification result are not signed; the event times and state are committed by the chain. The event hash covers the UTF-8 RFC 8785 canonical JSON representation of the complete event. The state hash covers the canonical projected state. Canonicalization sorts object keys by UTF-16 code units, preserves array order, uses ECMAScript JSON primitive serialization, and rejects nonfinite numbers, non-JSON values and malformed Unicode.

The checkpoint signs the canonical JSON bytes of:

```json
{"format":"prova-evidence-checkpoint-v1","campaignId":"…","sequence":1,"hash":"…"}
```

Checkpoint fields are `algorithm: "Ed25519"`, SPKI PEM `publicKey`, `keyId` (SHA-256 of the canonical JSON public-key string), and base64 `signature`. The checkpoint is outside the event hash, avoiding a signature/hash cycle. Independently pin a trusted key when signatures are required; a self-contained unsigned export cannot prove that signatures were not removed.

The state projection excludes the optimistic concurrency `version`. String values named `token`, `proof`, `snapshot`, or `content` are replaced with `{ "sha256": "…" }` commitments, so approval credentials, signed price tokens and attachment contents are not distributed in exports. All other campaign JSON fields are committed, including source reports and assumptions, proposal selections and prices, order amounts and provider references, refund allocations, payout summaries, finance messages, operations, audit history, and deletion state. Changing a committed credential or attachment also changes its commitment. The wallet, session secrets and provider credentials live outside campaign JSON and are not exported. Organization settings outside the campaign are not covered by this campaign chain.

Sources distinguish the shared account, server, disaster worker, verified webhook handler, migration, and demo seeding. Browser-submitted proposals and finance review metadata remain browser-supplied evidence; a source label does not turn them into verified PayPal facts. Checkout validates signed catalog prices, and provider result events describe records verified by existing server code. `checkout.approved` records a shared-account checkout request and the exact validated cart, total and idempotency reference, before the network call; it does not claim buyer consent or a completed capture. `finance.approval.requested` records the validated signed action requested by the shared account before execution; the finance service still revalidates balances and provider references. Repeated approval intents reuse their event IDs. Successful provider results are recorded by their corresponding later server saves. A timeout can therefore leave an approval intent without a success event, until reconciliation recovers the outcome.

## Integrity and limits

Campaign row locks serialize appends across browsers, workers and webhook handlers. Campaign updates, evidence events and the saved head commit together. SQL triggers reject normal updates, deletes and truncation of evidence; hard deletion of campaigns is restricted by the evidence foreign key. Soft-deleted campaigns retain exportable evidence through the authenticated API. Campaign loading before financial operations checks the current state against the evidence head, and rejects mismatches before contacting a provider. Full verification checks every event and signature and compares the final state to the saved campaign.

This establishes consistency of recorded evidence relative to a trusted checkpoint. It does not establish physical delivery, truth of an AI/source claim, an individual human identity, or an independently certified timestamp. An administrator with table-owner privileges can disable triggers and rewrite database contents. An attacker controlling both the application/signing key and database can issue new signatures. External retention of checkpoints and independently trusted public keys is necessary to detect history replacement or rollback. No external timestamping or checkpoint publication service is configured automatically.

The administrative `pnpm db:reset --confirm-reset` command explicitly disables the evidence trigger inside its reset transaction and deletes evidence along with the demo workspace. It requires table-owner privileges and destroys the local evidence history; export and retain checkpoints first. Never use it for normal deployments. The append-only table stores full projected snapshots per event; storage grows with campaign activity and should be monitored for busy or long-lived campaigns.
