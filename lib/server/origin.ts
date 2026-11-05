export function appOrigin(request: Request) {
  // Render terminates HTTPS before forwarding to Next.js. Use its public URL for cookies, CSRF checks and PayPal redirects.
  return new URL(process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || request.url).origin
}
