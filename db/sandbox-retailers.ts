import type { RetailerRecipient } from '../lib/types'

// Developer-owned sandbox businesses standing in for these retailers. These
// emails are test recipients, never the retailers' real payment accounts.
export const sandboxRetailers: RetailerRecipient[] = [
  { domain: 'lowes.com', email: 'sb-grslc53656864@business.example.com' },
  { domain: 'homedepot.com', email: 'sb-koj1353657062@business.example.com' },
  { domain: 'grainger.com', email: 'sb-ph436953657146@business.example.com' },
  { domain: 'uline.com', email: 'sb-1q9ow53657207@business.example.com' },
  { domain: 'zoro.com', email: 'sb-b47zdz53657212@business.example.com' },
  { domain: 'walmart.com', email: 'sb-v475ie53655840@business.example.com' },
  { domain: 'amazon.com', email: 'sb-wbnac53655842@business.example.com' },
  { domain: 'costco.com', email: 'sb-p0uyt53655891@business.example.com' },
  { domain: 'samsclub.com', email: 'sb-4743txe53655898@business.example.com' },
  { domain: 'globalindustrial.com', email: 'sb-1s8yg53655913@business.example.com' },
]
