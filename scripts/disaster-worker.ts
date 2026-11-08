import './env'
import { database } from '../lib/server/db'
import { claimDisaster, processDisaster } from '../lib/server/disasters'

let stopping = false
let wake: (() => void) | undefined
function stop() { stopping = true; wake?.() }
process.on('SIGTERM', stop)
process.on('SIGINT', stop)

async function main() {
  console.log('Disaster worker started; polling PostgreSQL every two seconds.')
  while (!stopping) {
    try {
      const job = await claimDisaster()
      if (job) { await processDisaster(job); continue }
    } catch (error) { console.error('Disaster worker:', error instanceof Error ? error.message : error) }
    if (!stopping) await new Promise<void>(resolve => {
      const timer = setTimeout(() => { wake = undefined; resolve() }, 2000)
      wake = () => { clearTimeout(timer); wake = undefined; resolve() }
    })
  }
}

// A forced termination is recovered through the expiring database lease.
main().catch(error => { console.error(error); process.exitCode = 1 })
  .finally(async () => { if (process.env.DATABASE_URL) await database().end() })
