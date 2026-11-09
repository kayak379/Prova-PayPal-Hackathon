import type { EvidenceBundle, EvidenceView } from '../evidence'
import { hashEvidence } from './evidence-crypto'

export function evidencePage(bundle: EvidenceBundle, requestedPage: number): Pick<EvidenceView, 'latestRecord' | 'records' | 'page' | 'pages' | 'total'> {
  const size = 10
  const pages = Math.max(1, Math.ceil(bundle.records.length / size))
  const page = Math.min(requestedPage, pages)
  const start = Math.max(0, bundle.records.length - page * size)
  const end = Math.max(0, bundle.records.length - (page - 1) * size)
  const latestSigned = bundle.records.findLast(record => record.checkpoint)?.event.sequence ?? null
  const records = bundle.records.slice(start, end).map((record, offset) => {
    const current = record.event.state as Record<string, unknown> | null
    const previous = bundle.records[start + offset - 1]?.event.state as Record<string, unknown> | undefined
    const keys = new Set([...Object.keys(current ?? {}), ...Object.keys(previous ?? {})])
    const changedFields = [...keys].filter(key => {
      const before = previous && Object.hasOwn(previous, key) ? hashEvidence(previous[key]) : null
      const after = current && Object.hasOwn(current, key) ? hashEvidence(current[key]) : null
      return before !== after
    }).sort()
    return { ...record, changedFields, coveredBySequence: latestSigned !== null && latestSigned >= record.event.sequence ? latestSigned : null }
  }).reverse()
  return { latestRecord: bundle.records.at(-1) ?? null, records, page, pages, total: bundle.records.length }
}
