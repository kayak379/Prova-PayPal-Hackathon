const states = new Set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY AS GU MP PR VI'.split(' '))

// Format presentation only. Geocoding remains the authority for location;
// never guess street/city boundaries or remove apartment and unit details.
export function formatAddress(value: string): string {
  const address = value.split(/[\r\n,]+/).map(part => part.trim().replace(/\s+/g, ' ')).filter(Boolean).join(', ')
  return address.replace(/(?:,\s*|\s+)([a-z]{2})\s*(\d{5})(?:[-\s]?(\d{4}))?$/i, (match, state: string, zip: string, extension?: string) =>
    states.has(state.toUpperCase()) ? `, ${state.toUpperCase()} ${zip}${extension ? '-' + extension : ''}` : match,
  )
}
