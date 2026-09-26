import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

// Display helpers for the fuel module. Values arrive as the integers of
// `convex/lib/fuel.ts` (liters, p4 = 1/10 000 €, p3 = 1/1 000 €, cents) and
// are only divided here, for display.

export function localToday(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function utcDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

export function makeFormatters(locale: string) {
  const nf = (digits: number, useGrouping = true) =>
    new Intl.NumberFormat(locale, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
      useGrouping,
    })
  const f0 = nf(0)
  const f1 = nf(1)
  const f2 = nf(2)
  const f3 = nf(3)
  const f4 = nf(4)
  // Input values: no thousands separator, so what we write back into a field
  // always parses again (an English "1,234" would otherwise read as 1.234).
  const in3 = nf(3, false)
  const in4 = nf(4, false)
  const date = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' })
  const shortDay = date({ weekday: 'short', day: 'numeric' })
  const longDay = date({ weekday: 'long', day: 'numeric', month: 'long' })
  const numericDay = date({ day: '2-digit', month: '2-digit', year: 'numeric' })
  const monthYear = date({ month: 'long', year: 'numeric' })
  const sign = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '')

  return {
    liters: (l: number) => f0.format(l),
    unit: (p4: number) => f4.format(p4 / 10_000),
    pump: (p3: number) => f3.format(p3 / 1_000),
    signedUnit: (p4: number) => sign(p4) + f4.format(Math.abs(p4) / 10_000),
    euros: (cents: number) => `${f2.format(cents / 100)} €`,
    rate: (tenths: number | null) =>
      tenths === null ? '—' : `${f1.format(tenths / 10)} %`,
    inputLiters: (l: number) => String(l),
    inputUnit: (p4: number) => in4.format(p4 / 10_000),
    inputPump: (p3: number) => in3.format(p3 / 1_000),
    shortDay: (iso: string) => shortDay.format(utcDate(iso)),
    longDay: (iso: string) => {
      const s = longDay.format(utcDate(iso))
      return s.charAt(0).toUpperCase() + s.slice(1)
    },
    numericDay: (iso: string) => numericDay.format(utcDate(iso)),
    month: (yyyyMm: string) => {
      const s = monthYear.format(utcDate(`${yyyyMm}-01`))
      return s.charAt(0).toUpperCase() + s.slice(1)
    },
  }
}

export type FuelFormatters = ReturnType<typeof makeFormatters>

export function useFormatters(): FuelFormatters {
  const { i18n } = useTranslation()
  return useMemo(() => makeFormatters(i18n.language), [i18n.language])
}

/** Tailwind text color for a signed amount (semantic tokens only). */
export function signClass(v: number | null): string {
  if (v === null || v === 0) return 'text-muted-foreground'
  return v > 0 ? 'text-positive' : 'text-destructive'
}
