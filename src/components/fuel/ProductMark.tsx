import type { FuelProduct } from '../../../convex/lib/fuel'

// The harmonised EU fuel label printed on pumps and filler caps (EN 16942):
// circle for petrol, square for diesel, diamond for gas. AdBlue is AUS 32.
const MARKS: Record<
  FuelProduct,
  { text: string; shape: 'circle' | 'square' | 'diamond' | 'pill' }
> = {
  sp98: { text: 'E5', shape: 'circle' },
  e10: { text: 'E10', shape: 'circle' },
  go: { text: 'B7', shape: 'square' },
  go_plus: { text: 'B7', shape: 'square' },
  e85: { text: 'E85', shape: 'circle' },
  gpl: { text: 'LPG', shape: 'diamond' },
  adblue: { text: 'AUS', shape: 'pill' },
}

export function ProductMark({ product }: { product: FuelProduct }) {
  const { text, shape } = MARKS[product]
  return (
    <svg viewBox="0 0 30 30" className="size-7 shrink-0" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.4">
        {shape === 'circle' && <circle cx="15" cy="15" r="13" />}
        {shape === 'square' && <rect x="2.5" y="2.5" width="25" height="25" />}
        {shape === 'diamond' && <path d="M15 1.5 28.5 15 15 28.5 1.5 15Z" />}
        {shape === 'pill' && (
          <rect x="2.5" y="6" width="25" height="18" rx="4" />
        )}
      </g>
      <text
        x="15"
        y="18.2"
        textAnchor="middle"
        fill="currentColor"
        fontSize="8.5"
        fontWeight="600"
      >
        {text}
      </text>
    </svg>
  )
}
