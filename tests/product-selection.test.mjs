import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseSelection } from '../lib/server/product-selection.ts'

const allowed = new Set(['p1', 'p2'])
test('normalizes harmless model formatting without changing quantities', () => {
 assert.deepEqual(parseSelection({ items: [{ id: ' P1 ', qty: '2,000', explanation: 'Water for evacuees.' }, { id: 'p2', quantity: '3' }] }, allowed), [
  { id: 'p1', qty: 2000, explanation: 'Water for evacuees.' }, { id: 'p2', qty: 3, explanation: undefined },
 ])
})
test('omits zero-quantity candidates and deduplicates identical selections', () => {
 const result = parseSelection({ items: [{ id: 'p1', qty: 2 }, { id: 'p1', qty: 2 }, { id: 'unselected', qty: 0 }] }, allowed)
 assert.equal(result.length, 1)
 assert.equal(result[0].qty, 2)
})
test('rejects invented references and conflicting duplicates', () => {
 assert.throws(() => parseSelection({ items: [{ id: 'invented', qty: 1 }] }, allowed), /Unknown product/)
 assert.throws(() => parseSelection({ items: [{ id: 'p1', qty: 2 }, { id: 'p1', qty: 3 }] }, allowed), /conflicting/)
})
test('does not round, parse unit labels, or accept unsafe quantities', () => {
 for (const qty of [-1, 1.5, '2 packs', '1.5', null, true, Infinity, 1000000]) {
  assert.throws(() => parseSelection({ items: [{ id: 'p1', qty }] }, allowed))
 }
})
test('rejects empty or malformed selections', () => {
 for (const value of [null, {}, { items: [] }, { items: [null] }, { items: [{ id: 'p1', qty: 0 }] }]) {
  assert.throws(() => parseSelection(value, allowed))
 }
})
