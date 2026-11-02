// The Toolkit can return PayPal's multipart response as text, including headers.
export function invoiceQr(response: unknown): string {
  const value: any = response
  let raw =
    typeof value === 'string'
      ? value
      : value?.image || value?.qr_code || value?.data
  if (typeof raw !== 'string') throw new Error('PayPal returned no QR image.')
  raw = raw.replace(/^data:image\/png;base64,/, '').trim()
  if (raw.startsWith('--')) {
    const part = raw.split(/\r?\n--[^\r\n]+/)[0]
    const separator = part.search(/\r?\n\r?\n/)
    if (separator < 0) throw new Error('Invalid PayPal QR response.')
    raw = part.slice(separator).trim()
  }
  raw = raw.replace(/\s/g, '')
  if (
    !/^[A-Za-z0-9+/]+={0,2}$/.test(raw) ||
    Buffer.from(raw, 'base64').subarray(0, 8).toString('hex') !==
      '89504e470d0a1a0a'
  )
    throw new Error('PayPal returned an invalid QR image.')
  return `data:image/png;base64,${raw}`
}
