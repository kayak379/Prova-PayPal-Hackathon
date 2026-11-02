const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const mod = { exports: {} }
new Function('exports', ts.transpileModule(
  fs.readFileSync('lib/campaign-request.ts', 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText)(mod.exports)
const { discoveryRequest, splitLegacyRequest } = mod.exports
const attachment = { name: 'supplies.csv', content: 'item,quantity\nWater,100' }

test('CSV content reaches discovery without changing the visible request', () => {
  const prompt = 'Flood relief for 100 families.'
  const result = discoveryRequest(prompt, attachment)
  assert.equal(result, `${prompt}\nSupplies list (supplies.csv):\n${attachment.content}`)
  assert.equal(discoveryRequest(prompt, null), prompt)
  assert(discoveryRequest('', attachment).includes('Water,100'))
})

test('existing combined requests migrate into editable text and a separate file', () => {
  const combined = discoveryRequest('Flood relief.', attachment)
  assert.deepEqual(splitLegacyRequest(combined), { prompt: 'Flood relief.', attachment })
  assert.deepEqual(splitLegacyRequest(discoveryRequest('', attachment)), { prompt: '', attachment })
})

test('ordinary requests remain intact and do not invent an attachment', () => {
  const prompt = 'Need water\nand shelter. Supplies list to follow.'
  assert.deepEqual(splitLegacyRequest(prompt), { prompt, attachment: null })
})
