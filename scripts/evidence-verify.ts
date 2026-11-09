import { readFile } from 'node:fs/promises'
import { verifyRecords } from '../lib/server/evidence-crypto'
import type { EvidenceBundle } from '../lib/evidence'

async function main() {
  const [file, trustedKeyFile, checkpointFile] = process.argv.slice(2)
  if (!file) throw new Error('Usage: pnpm evidence:verify <export.json> [trusted-public-key.pem] [earlier-export.json]')
  const bundle = JSON.parse(await readFile(file, 'utf8')) as EvidenceBundle
  const trustedKey = trustedKeyFile ? await readFile(trustedKeyFile, 'utf8') : undefined
  const result = verifyRecords(bundle, trustedKey)
  if (!result.valid) throw new Error(result.error)
  if (checkpointFile) {
    const previous = JSON.parse(await readFile(checkpointFile, 'utf8')) as EvidenceBundle
    const checked = verifyRecords(previous)
    if (!checked.valid || previous.campaignId !== bundle.campaignId ||
        bundle.records[previous.head.sequence - 1]?.hash !== previous.head.hash) {
      throw new Error('Current evidence does not extend the retained checkpoint.')
    }
  }
  console.log(`Verified ${result.count} events for ${bundle.campaignId}. Head: ${result.headHash}`)
  console.log(trustedKey ? 'Latest checkpoint matches the trusted public key.' : result.signed ? 'Signature valid. Public key is supplied by the export; independently pin a trusted key to authenticate its origin.' : 'Unsigned chain. Retain this export outside the database as a checkpoint.')
  if (result.baseline) console.log('History begins with a migration baseline; earlier activity was not cryptographically witnessed.')
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })
