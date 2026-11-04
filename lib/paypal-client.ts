type Session = {
  start: (options: { presentationMode: 'modal' }, order: Promise<{ orderId: string }>) => Promise<void>
}

type SDK = {
  createPayPalSavePaymentSession: (callbacks: {
    onApprove: (data: { vaultSetupToken?: string }) => Promise<void>
    onCancel: () => void
    onError: (error: unknown) => void
  }) => {
    start: (options: { presentationMode: 'modal' }, setup: Promise<{ vaultSetupToken: string }>) => Promise<void>
  }
  findEligibleMethods: (options: { currencyCode: string }) => Promise<{ isEligible: (method: string) => boolean }>
  createPayPalOneTimePaymentSession: (callbacks: {
    onApprove: (data: { orderId: string }) => Promise<void>
    onCancel: () => void
    onError: (error: unknown) => void
  }) => Session
}

declare global {
  interface Window {
    paypal?: {
      createInstance: (options: { clientId?: string; clientToken?: string; components: string[] }) => Promise<SDK>
    }
  }
}

let loading: Promise<SDK> | undefined

export function paypalSDK(): Promise<SDK> {
  if (!loading) loading = (async () => {
    const config = await fetch('/api/checkout/config').then(r => r.json())
    if (!window.paypal) await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://www.sandbox.paypal.com/web-sdk/v6/core'
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('PayPal could not load. Please retry.'))
      document.head.append(script)
    })
    if (!window.paypal) throw new Error('PayPal SDK unavailable.')
    return window.paypal.createInstance({ clientId: config.clientId, components: ['paypal-payments'] })
  })().catch(error => {
    loading = undefined
    throw error
  })
  return loading
}

export async function paypalVaultSDK(): Promise<SDK> {
  return paypalSDK()
}
