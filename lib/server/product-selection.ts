// Model-facing references are deliberately separate from Channel3's opaque IDs.
export type Selection = { id: string; qty: number; explanation?: string }
export function selectionReference(value: unknown): string {
 return typeof value === 'string' ? value.trim().toLowerCase() : ''
}
export function selectionQuantity(value: unknown): number {
 if (typeof value === 'string' && /^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(value.trim())) value = Number(value.replaceAll(',', '').trim())
 if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 999999) throw new Error('Quantities must be whole numbers from 1 to 999999; omit unwanted products.')
 return value
}
export function parseSelection(result: unknown, allowed: Set<string>): Selection[] {
 const rows = (result as { items?: unknown })?.items
 if (!Array.isArray(rows)) throw new Error('Return an object with an items array.')
 const selections = new Map<string, Selection>()
 for (const row of rows) {
  if (!row || typeof row !== 'object') throw new Error('Each selected item must contain id and qty.')
  const qty = selectionQuantity(row.qty ?? row.quantity)
  if (qty === 0) continue
  const id = selectionReference(row.id)
  if (!allowed.has(id)) throw new Error(`Unknown product reference ${JSON.stringify(row.id)}. Use only the candidate id values.`)
  const previous = selections.get(id)
  if (previous && previous.qty !== qty) throw new Error(`Product ${id} has conflicting quantities; return it once.`)
  selections.set(id, { id, qty, explanation: typeof row.explanation === 'string' ? row.explanation : undefined })
 }
 if (!selections.size) throw new Error('Select at least one candidate with a positive whole-number quantity.')
 return [...selections.values()]
}
