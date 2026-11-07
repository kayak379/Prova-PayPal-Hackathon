import type { PayoutSummary } from '@/lib/types'
import { usdPrecise } from '@/lib/format'

export function PayoutStatus({ payouts }: { payouts: PayoutSummary }) {
  return (
    <div className="text-left text-xs" role="status">
      <p className="font-medium">Retailer payouts · {payouts.status.toLowerCase().replaceAll('_', ' ')}</p>
      <ul className="mt-2 flex flex-col gap-1 text-muted-foreground">
        {payouts.items.map(item => (
          <li key={item.senderItemId}>
            <span className="flex justify-between gap-3"><span>{item.retailer}</span><span className="tabular">{usdPrecise(item.amountCents / 100)} · {item.status.toLowerCase().replaceAll('_', ' ')}</span></span>
            <span className="break-all">{item.recipient}</span>
            {item.error && <span className="block text-destructive">{item.error}</span>}
          </li>
        ))}
      </ul>
      {payouts.error && <p className="mt-2 text-destructive">{payouts.error}</p>}
    </div>
  )
}
