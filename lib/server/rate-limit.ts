const WINDOW_MS = 60_000
const buckets = new Map<string, { count: number; resetsAt: number }>()

// Shared by this server process: the app has one team identity.
export function rateLimit(path: string, now = Date.now()): number {
  const rules: [string, number][] = [['api', 120]]
  if (path === '/api/auth/login') rules.push(['login', 10])
  if (path === '/api/discovery' || path === '/api/finance/chat') rules.push(['ai', 10])

  for (const [key, limit] of rules) {
    const bucket = buckets.get(key)
    if (bucket && now < bucket.resetsAt && bucket.count >= limit) {
      return Math.ceil((bucket.resetsAt - now) / 1000)
    }
  }
  for (const [key] of rules) {
    let bucket = buckets.get(key)
    if (!bucket || now >= bucket.resetsAt) {
      bucket = { count: 0, resetsAt: now + WINDOW_MS }
      buckets.set(key, bucket)
    }
    bucket.count++
  }
  return 0
}
