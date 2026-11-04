const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const mod = { exports: {} }
new Function('exports', ts.transpileModule(
  fs.readFileSync('lib/agent-pacing.ts', 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText)(mod.exports)
const { agentStageDelay, AGENT_CYCLE_MS, AGENT_SETTLE_MS } = mod.exports

test('an instant result leaves time for a complete animation before advancing', () => {
  assert.equal(agentStageDelay(0), 3000)
  assert.equal(agentStageDelay(500), 2500)
  assert.equal(agentStageDelay(2999), 1)
  assert.equal(agentStageDelay(3000), 0)
})

test('slow results wait only for the current cycle boundary', () => {
  for (const elapsed of [3100, 5900, 12000, 60000]) {
    const delay = agentStageDelay(elapsed)
    assert(delay >= 0 && delay <= AGENT_CYCLE_MS)
    const completedCycles = (elapsed + delay - AGENT_SETTLE_MS) / AGENT_CYCLE_MS
    assert.equal(completedCycles, Math.round(completedCycles))
  }
})

test('reduced motion allows reading time without waiting for animation cycles', () => {
  assert.equal(agentStageDelay(0, true), 1500)
  assert.equal(agentStageDelay(500, true), 1000)
  assert.equal(agentStageDelay(2000, true), 0)
})
