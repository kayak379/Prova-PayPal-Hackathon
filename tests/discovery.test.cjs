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
function harness(responses) {
 const requests = []
 const providers = []
 const common = {
  env: () => 'test', sign: JSON.stringify, verify: JSON.parse,
  external: async (url, init) => {
   const body = JSON.parse(init.body)
   if (url.includes('channel3')) return { products: [product('opaque-Channel3-ID-A', 'Blanket'), product('opaque-Channel3-ID-B', 'Water')] }
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
 const h = harness([{ queries: ['bulk blankets'] }, { items: [{ id: ' P1 ', qty: '2', explanation: 'Keeps evacuees warm.' }, { id: 'p2', qty: 0 }] }])
 const plan = await h.discover({ prompt, budget: 100 }, () => {})
 assert.equal(h.requests[1].candidates[0].id, 'p1')
 assert.equal(plan.items[0].id, 'opaque-Channel3-ID-A')
 assert.equal(plan.items[0].unitPriceCents, 1000)
 assert.equal(plan.items[0].qty, 2)
 assert.equal(plan.shipping, 1)
 assert.equal(plan.tax, 1.6)
 assert.equal(JSON.parse(plan.snapshot).products[0].id, 'opaque-Channel3-ID-A')
})
test('repair receives the rejected response and specific validation error', async () => {
 const bad = { items: [{ id: 'made-up', qty: 2 }] }
 const h = harness([{ queries: ['water cases'] }, bad, { items: [{ id: 'p2', qty: 2 }] }])
 const plan = await h.discover({ prompt, budget: 100 }, () => {})
 assert.deepEqual(h.requests[2].previousResponse, bad)
 assert.match(h.requests[2].validationError, /Unknown product reference/)
 assert.equal(plan.items[0].id, 'opaque-Channel3-ID-B')
})
test('revision references preserve unrelated original items exactly', async () => {
 const first = harness([{ queries: ['bulk supplies'] }, { items: [{ id: 'p1', qty: 2 }, { id: 'p2', qty: 3 }] }])
 const plan = await first.discover({ prompt, budget: 100 }, () => {})
 const edit = harness([{ queries: [] }, { edits: [{ action: 'remove', id: 'p1' }] }])
 const revised = await edit.discover({ prompt, budget: 100, feedback: 'Remove only the blanket.', currentPlan: plan }, () => {})
 assert.deepEqual(revised.items, JSON.parse(JSON.stringify([plan.items[1]])))
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
 const first = harness([{ queries: ['bulk supplies'] }, { items: [{ id: 'p1', qty: 2 }, { id: 'p2', qty: 3 }] }])
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
 const h = harness([new Error('Temporary timeout'), { queries: ['bulk supplies'] }, { items: [{ id: 'p1', qty: 2 }] }])
 const events = []
 const plan = await h.discover({ prompt, budget: 100 }, (stage, detail) => events.push(detail))
 assert.equal(h.requests.length, 3)
 assert.notEqual(plan.mock, true)
 assert.equal(plan.items[0].id, 'opaque-Channel3-ID-A')
 assert(events.some(detail => detail.includes('attempt 2 of 3')))
})

test('OpenRouter retries exhaust before Gemini, then Gemini handles the remaining flow', async () => {
 const h = harness([new Error('429'), new Error('429'), new Error('429'), { queries: ['water cases'] }, { items: [{ id: 'p2', qty: 3, explanation: 'Provides drinking water for evacuees.' }] }])
 const events = []
 const plan = await h.discover({ prompt, budget: 100 }, (stage, detail) => events.push(detail))
 assert.deepEqual(h.providers, ['openrouter', 'openrouter', 'openrouter', 'gemini', 'gemini'])
 assert.notEqual(plan.mock, true)
 assert.equal(plan.items[0].id, 'opaque-Channel3-ID-B')
 assert(events.some(detail => detail.includes('trying Gemini')))
})

test('unusable OpenRouter search planning tries Gemini before mock fallback', async () => {
 const h = harness([{ queries: [] }, { queries: ['bulk supplies'] }, { items: [{ id: 'p1', qty: 2 }] }])
 const plan = await h.discover({ prompt, budget: 100 }, () => {})
 assert.deepEqual(h.providers, ['openrouter', 'gemini', 'gemini'])
 assert.notEqual(plan.mock, true)
})
