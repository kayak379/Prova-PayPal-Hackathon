import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import { rateLimit } from '../lib/server/rate-limit'
import { proxy } from '../proxy'

test('limits login and combined AI requests, with independent windows that reset', () => {
  for (let i = 0; i < 10; i++) assert.equal(rateLimit('/api/auth/login', 0), 0)
  assert.equal(rateLimit('/api/auth/login', 1000), 59)
  for (let i = 0; i < 10; i++) {
    assert.equal(rateLimit(i % 2 ? '/api/discovery' : '/api/finance/chat', 1000), 0)
  }
  assert.equal(rateLimit('/api/discovery', 2000), 59)
  assert.equal(rateLimit('/api/workspace', 2000), 0)
  assert.equal(rateLimit('/api/auth/login', 60000), 0)
  assert.equal(rateLimit('/api/discovery', 61000), 0)
  for (let i = 0; i < 118; i++) assert.equal(rateLimit('/api/workspace', 61000), 0)
  assert.equal(rateLimit('/api/checkout/capture', 61000), 59)
})

test('proxy returns 429 and Retry-After before reaching the login route', () => {
  const request = () => new NextRequest('https://demo.example/api/auth/login', {
    method: 'POST', headers: { origin: 'https://demo.example' },
  })
  for (let i = 0; i < 10; i++) assert.equal(proxy(request()).status, 200)
  const response = proxy(request())
  assert.equal(response.status, 429)
  assert.ok(Number(response.headers.get('Retry-After')) > 0)
})
