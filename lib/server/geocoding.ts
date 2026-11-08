import type { ShippingLocation } from '../types'

export async function geocodeAddress(address: string): Promise<ShippingLocation> {
  const url = new URL('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress')
  url.search = new URLSearchParams({ address, benchmark: 'Public_AR_Current', format: 'json' }).toString()
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error('Address lookup unavailable. Retry saving your settings.')
  const matches = (await response.json()).result?.addressMatches
  if (!Array.isArray(matches) || matches.length !== 1) throw new Error('Enter a complete, unambiguous U.S. shipping address before enabling proactive campaigns.')
  const match = matches[0]
  const latitude = match.coordinates?.y, longitude = match.coordinates?.x
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw new Error('Address lookup did not return valid coordinates.')
  return { address, matchedAddress: String(match.matchedAddress), latitude, longitude }
}
