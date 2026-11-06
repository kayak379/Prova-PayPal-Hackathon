'use client'

const BILL = 'M10 20 C20 20 38 20 50 20 L50 41 C38 41 20 41 10 41 Z'

export function FinanceMoney() {
  return (
    <svg viewBox="0 0 64 64" className="size-14 shrink-0 text-brand" aria-hidden="true">
      <circle cx="32" cy="32" r="29" fill="var(--brand-soft)" />
      {[2, 1, 0].map((layer) => (
        <g key={layer} transform={`translate(${layer * 1.5} ${layer * 4})`}>
          <g
            className="finance-bill-flutter"
            style={{
              animationDelay: `${2 + layer * 0.12}s`,
            }}
          >
            <path
              d={BILL}
              fill={layer === 0 ? 'currentColor' : 'var(--card)'}
              stroke="currentColor"
              strokeWidth={layer === 0 ? 1.5 : 1}
              strokeOpacity={layer === 2 ? 0.55 : layer === 1 ? 0.8 : 1}
              strokeLinejoin="round"
            />
            {layer === 0 && (
              <g fill="none" stroke="var(--brand-foreground)" strokeLinecap="round">
                <ellipse cx="30" cy="30.5" rx="7" ry="8" strokeOpacity=".45" />
                <path
                  d="M33 27 H29 A1.75 1.75 0 0 0 29 30.5 H31 A1.75 1.75 0 0 1 31 34 H27 M30 25 V36"
                  strokeWidth="1.4"
                />
                <path d="M15 28 V25 H19 M41 36 H45 V33" strokeOpacity=".55" strokeWidth="1.2" />
              </g>
            )}
          </g>
        </g>
      ))}
    </svg>
  )
}
