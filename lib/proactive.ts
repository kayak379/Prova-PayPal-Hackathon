import type { Plan, ProactiveSettings } from './types'

export function proactiveDefaults(folderId = ''): ProactiveSettings {
  return { enabled: false, radiusMiles: 100, budget: 10000, people: 200, days: 3, folderId }
}

export function distanceMiles(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const rad = (n: number) => n * Math.PI / 180
  const dLat = rad(b.latitude - a.latitude), dLon = rad(b.longitude - a.longitude)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2
  return 3958.7613 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))))
}

// Display only; checkout independently verifies the signature and expiry on the server.
export function proposalExpires(plan: Plan): number {
  try {
    const data = JSON.parse(atob((plan.snapshot || '').split('.')[0].replace(/-/g, '+').replace(/_/g, '/')))
    return typeof data.expires === 'number' ? data.expires : 0
  } catch { return 0 }
}
