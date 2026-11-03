const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

// Execute the real discovery orchestration with deterministic provider responses.
function load(file, common) {
 const filename = path.resolve(file)
 const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
 const module = { exports: {} }
 const imports = name => name === './common' ? common : load(path.resolve(path.dirname(filename), name) + '.ts', common)
 new Function('require', 'module', 'exports', code)(imports, module, module.exports)
 return module.exports
}
const product = (id, name) => ({ id, title: name, category: { title: 'Emergency supplies' }, offers: [{ domain: 'lowes.com', url: `https://www.lowes.com/p/${id}`, availability: 'InStock', price: { price: 10, currency: 'USD' } }] })
const prompt = 'Emergency shelter for 20 people requiring blankets and water.'
const { allocateBudget } = load('lib/server/budget-allocation.ts', {})
const { totalsCents } = load('lib/money.ts', {})

test('budget allocation fills useful quantities without exceeding rounded charges or dropping products', () => {
 const items = [137, 299, 71, 89].map((price, i) => ({ id: `p${i}`, unitPriceCents: price, unitPrice: price / 100, qty: i + 1 }))
 for (const budget of [674, 1000, 1001, 5000, 9999, 10000, 100000, 1000000]) {
  const allocated = allocateBudget(items, budget)
  assert.equal(allocated.length, 4)
  assert(allocated.every(item => Number.isSafeInteger(item.qty) && item.qty >= 1 && item.qty <= 999999))
  assert(totalsCents(allocated).total <= budget)
  for (let i = 0; i < allocated.length; i++) {
   const extra = allocated.map((item, index) => ({ ...item, qty: item.qty + (index === i ? 1 : 0) }))
   assert(totalsCents(extra).total > budget, 'No further selected unit should fit the remaining budget')
  }
 }
 assert.deepEqual(items.map(item => item.qty), [1, 2, 3, 4], 'Input choices remain unchanged')
 assert.throws(() => allocateBudget(items, 100), /budget cannot cover/)
 assert.throws(() => allocateBudget(items.slice(0, 2), 10000), /at least four/)
})
function harness(responses) {
 const requests = []
 const providers = []
 const common = {
  env: () => 'test', sign: JSON.stringify, verify: JSON.parse,
  external: async (url, init) => {
   const body = JSON.parse(init.body)
   if (url.includes('channel3')) return { products: [product('opaque-Channel3-ID-A', 'Blanket'), product('opaque-Channel3-ID-B', 'Water'), product('opaque-Channel3-ID-C', 'First aid'), product('opaque-Channel3-ID-D', 'Masks')] }
   const gemini = url.includes('generativelanguage.googleapis.com')
   providers.push(gemini ? 'gemini' : 'openrouter')
   requests.push(JSON.parse(gemini ? body.contents[0].parts[0].text : body.messages[1].content))
   assert(responses.length, 'unexpected model request')
   const response = responses.shift()
   if (response instanceof Error) throw response
   return gemini ? { candidates: [{ content: { parts: [{ text: JSON.stringify(response) }] } }] } : { choices: [{ message: { content: JSON.stringify(response) } }] }
  },
 }
 return { discover: load('lib/server/discovery.ts', common).discover, requests, providers }
}
test('short model references map back to authentic catalog IDs and prices', async () => {
 const h = harness([{ queries: ['bulk blankets'] }, { items: [{ id: ' P1 ', qty: '2', explanation: 'Keeps evacuees warm.' }, { id: 'p2', qty: 1 }, { id: 'p3', qty: 1 }, { id: 'p4', qty: 1 }] }])
 const plan = await h.discover({ prompt, budget: 100 }, () => {})
 assert.equal(h.requests[1].candidates[0].id, 'p1')
 assert.equal(plan.items[0].id, 'opaque-Channel3-ID-A')
 assert.equal(plan.items[0].unitPriceCents, 1000)
 assert.equal(plan.items[0].qty, 5)
 assert.equal(plan.shipping, 4)
 assert.equal(plan.tax, 6.4)
 assert.equal(JSON.parse(plan.snapshot).products[0].id, 'opaque-Channel3-ID-A')
})
test('repair receives the rejected response and specific validation error', async () => {
 const bad = { items: [{ id: 'made-up', qty: 2 }] }
 const h = harness([{ queries: ['water cases'] }, bad, { items: [{ id: 'p2', qty: 2 }, { id: 'p1', qty: 1 }, { id: 'p3', qty: 1 }, { id: 'p4', qty: 1 }] }])
 const plan = await h.discover({ prompt, budget: 100 }, () => {})
 assert.deepEqual(h.requests[2].previousResponse, bad)
 assert.match(h.requests[2].validationError, /Unknown product reference/)
 assert.equal(plan.items[0].id, 'opaque-Channel3-ID-B')
})

test('selection with fewer than four products is repaired before allocating the full budget', async () => {
 const h = harness([{ queries: ['bulk supplies'] }, { items: [{ id: 'p1', qty: 2 }] }, { items: [{ id: 'p1', qty: 2 }, { id: 'p2', qty: 1 }, { id: 'p3', qty: 1 }, { id: 'p4', qty: 1 }] }])
 const plan = await h.discover({ prompt, budget: 100 }, () => {})
 assert.match(h.requests[2].validationError, /at least four/)
 assert.equal(plan.items.length, 4)
 assert(totalsCents(plan.items).total <= 10000)
 assert(totalsCents(plan.items).total >= 9000)
})

test('a budget that cannot cover four real products returns an actionable error', async () => {
 const h = harness([{ queries: ['bulk supplies'] }])
 await assert.rejects(h.discover({ prompt, budget: 20 }, () => {}), /four products are required/)
 assert.equal(h.requests.length, 1)
})
test('revision references preserve unrelated original items exactly', async () => {
 const first = harness([{ queries: ['bulk supplies'] }, { items: [{ id: 'p1', qty: 2 }, { id: 'p2', qty: 3 }, { id: 'p3', qty: 1 }, { id: 'p4', qty: 1 }] }])
 const plan = await first.discover({ prompt, budget: 100 }, () => {})
 const edit = harness([{ queries: [] }, { edits: [{ action: 'remove', id: 'p1' }] }])
 const revised = await edit.discover({ prompt, budget: 100, feedback: 'Remove only the blanket.', currentPlan: plan }, () => {})
 assert.deepEqual(revised.items, JSON.parse(JSON.stringify(plan.items.filter(item => item.id !== plan.items[0].id))))
})
test('AI rate limits produce labeled signed mock data within budget', async () => {
 const h = harness(Array.from({ length: 6 }, () => new Error('AI provider unavailable')))
 const plan = await h.discover({ prompt, budget: 50 }, () => {})
 assert.deepEqual(h.providers, ['openrouter', 'openrouter', 'openrouter', 'gemini', 'gemini', 'gemini'])
 assert.equal(plan.mock, true)
 assert.match(plan.fallbackReason, /mock data/)
 assert(plan.items.length > 0)
 assert(plan.items.every(item => item.supplier === 'Mock bulk supplier'))
 const subtotal = plan.items.reduce((sum, item) => sum + item.unitPriceCents * item.qty, 0)
 assert(subtotal + Math.round(subtotal * .05) + Math.round(subtotal * .08) <= 5000)
 assert.equal(JSON.parse(plan.snapshot).mock, true)
})
test('failed AI revisions retain existing products and disclose unapplied feedback', async () => {
 const first = harness([{ queries: ['bulk supplies'] }, { items: [{ id: 'p1', qty: 2 }, { id: 'p2', qty: 3 }, { id: 'p3', qty: 1 }, { id: 'p4', qty: 1 }] }])
 const plan = await first.discover({ prompt, budget: 100 }, () => {})
 const edit = harness(Array.from({ length: 6 }, () => new Error('AI unavailable')))
 const result = await edit.discover({ prompt, budget: 100, feedback: 'Remove blankets', currentPlan: plan }, () => {})
 assert.deepEqual(result.items, plan.items)
 assert.equal(result.mock, true)
 assert.match(result.fallbackReason, /changes were not applied/)
})
test('input validation errors do not become mock proposals', async () => {
 const h = harness([])
 await assert.rejects(h.discover({ prompt: '', budget: 100 }, () => {}), /at least 9 characters/)
 assert.equal(h.requests.length, 0)
})

test('a successful API retry returns live products rather than mock data', async () => {
 const h = harness([new Error('Temporary timeout'), { queries: ['bulk supplies'] }, { items: [{ id: 'p1', qty: 2 }, { id: 'p2', qty: 1 }, { id: 'p3', qty: 1 }, { id: 'p4', qty: 1 }] }])
 const events = []
 const plan = await h.discover({ prompt, budget: 100 }, (stage, detail) => events.push(detail))
 assert.equal(h.requests.length, 3)
 assert.notEqual(plan.mock, true)
 assert.equal(plan.items[0].id, 'opaque-Channel3-ID-A')
 assert(events.some(detail => detail.includes('attempt 2 of 3')))
})

test('OpenRouter retries exhaust before Gemini, then Gemini handles the remaining flow', async () => {
 const h = harness([new Error('429'), new Error('429'), new Error('429'), { queries: ['water cases'] }, { items: [{ id: 'p2', qty: 3, explanation: 'Provides drinking water for evacuees.' }, { id: 'p1', qty: 1 }, { id: 'p3', qty: 1 }, { id: 'p4', qty: 1 }] }])
 const events = []
 const plan = await h.discover({ prompt, budget: 100 }, (stage, detail) => events.push(detail))
 assert.deepEqual(h.providers, ['openrouter', 'openrouter', 'openrouter', 'gemini', 'gemini'])
 assert.notEqual(plan.mock, true)
 assert.equal(plan.items[0].id, 'opaque-Channel3-ID-B')
 assert(events.some(detail => detail.includes('trying Gemini')))
})

test('unusable OpenRouter search planning tries Gemini before mock fallback', async () => {
 const h = harness([{ queries: [] }, { queries: ['bulk supplies'] }, { items: [{ id: 'p1', qty: 2 }, { id: 'p2', qty: 1 }, { id: 'p3', qty: 1 }, { id: 'p4', qty: 1 }] }])
 const plan = await h.discover({ prompt, budget: 100 }, () => {})
 assert.deepEqual(h.providers, ['openrouter', 'gemini', 'gemini'])
 assert.notEqual(plan.mock, true)
})
