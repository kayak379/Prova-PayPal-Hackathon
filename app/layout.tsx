import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Geist, Instrument_Serif } from 'next/font/google'
import { MotionProvider } from '@/components/motion-provider'
import { StoreProvider } from '@/lib/store'
import './globals.css'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' })
const instrument = Instrument_Serif({ subsets: ['latin'], weight: '400', style: ['normal', 'italic'], variable: '--font-instrument' })

export const metadata: Metadata = {
  title: 'Prova — Agentic commerce for disaster relief',
  description:
    'Describe the disaster and your budget. Prova sources, optimizes, and purchases relief supplies with financial controls.',
  generator: 'v0.app',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
  },
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#f6f2e7',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable} ${instrument.variable} bg-background`}>
      <body className="font-sans antialiased">
        <MotionProvider>
          <StoreProvider>{children}</StoreProvider>
        </MotionProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
