export type RequestAttachment = { name: string; content: string }

export function splitLegacyRequest(request: string) {
  const match = /\nSupplies list \(([^\n]+)\):\n([\s\S]*)$/.exec(request)
  return match
    ? {
        prompt: request.slice(0, match.index),
        attachment: { name: match[1], content: match[2] },
      }
    : { prompt: request, attachment: null }
}

export function discoveryRequest(
  prompt: string,
  attachment: RequestAttachment | null,
) {
  return attachment
    ? `${prompt}\nSupplies list (${attachment.name}):\n${attachment.content}`
    : prompt
}
