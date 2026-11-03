'use client'

import { useId, type CSSProperties } from 'react'
import { useTheme } from './theme-provider'

export function ThemeToggle() {
  const { dark, toggle } = useTheme()
  const maskId = useId()
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Dark mode"
      aria-pressed={dark}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="theme-toggle relative inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <svg className="theme-toggle-icon size-5 overflow-visible" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
            <rect width="24" height="24" fill="white" />
            <circle className="theme-toggle-eclipse" cx="16" cy="8" r="5.5" fill="black" />
          </mask>
        </defs>
        <g className="theme-toggle-rays" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          {Array.from({ length: 8 }, (_, i) => (
            <g key={i} transform={`rotate(${i * 45} 12 12)`}>
              <path className="theme-toggle-ray" style={{ '--ray-index': i } as CSSProperties} d="M12 2v2" />
            </g>
          ))}
        </g>
        <g className="theme-toggle-disc">
          <circle cx="12" cy="12" r="5.5" fill="currentColor" mask={`url(#${maskId})`} />
        </g>
        <g className="theme-toggle-stars" fill="currentColor">
          <path d="m19 3 .7 1.8 1.8.7-1.8.7L19 8l-.7-1.8-1.8-.7 1.8-.7Z" />
          <circle cx="21" cy="11" r=".8" />
        </g>
      </svg>
    </button>
  )
}
