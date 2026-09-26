/**
 * Fuel margin engine: pure and dependency-free, shared by the Convex
 * functions, the UI and the Excel export, so every surface shows the same
 * numbers. Covered by `tests/fuel.test.ts` (`pnpm test:unit`).
 *
 * Only facts typed by a person are stored (volume sold, deliveries, pump
 * price, starting stock or a stock correction). Everything else — stock,
 * weighted average cost (PMP), margins — is recomputed here on every read, so
 * correcting a past day propagates to every later day.
 *
 * Integers only. Units:
 *   liters      integer L
 *   unit price  integer 1/10 000 € per L, excl. VAT ("p4"): purchase, PMP
 *   pump price  integer 1/1 000 € per L, incl. VAT ("p3"): as shown at the pump
 *   money       integer cents
 * Rounding happens only in `rdiv` (half away from zero).
 */

export const FUEL_PRODUCTS = [
  'sp98',
  'e10',
  'go',
  'go_plus',
  'e85',
  'gpl',
  'adblue',
] as const
export type FuelProduct = (typeof FUEL_PRODUCTS)[number]

/** Input bounds, enforced by the UI and again by the mutations. */
export const FUEL_LIMITS = {
  maxLiters: 200_000,
  minUnitPrice: 1_000, // 0.1000 €/L excl. VAT
  maxUnitPrice: 50_000, // 5.0000 €/L excl. VAT
  minPumpPrice: 100, // 0.100 €/L incl. VAT
  maxPumpPrice: 5_000, // 5.000 €/L incl. VAT
} as const

const VAT_PERCENT = 20

export type FuelDelivery = { liters: number; price: number }

export type FuelEntry = {
  date: string
  sold?: number
  price?: number
  deliveries: ReadonlyArray<FuelDelivery>
  /** Starting stock, or a correction after a tank dip. Always set together. */
  fixStock?: number
  fixPmp?: number
}

export type FuelRow = {
  date: string
  entry: FuelEntry | null
  /** The morning stock comes from `fixStock` / `fixPmp`, not from the day before. */
  fixed: boolean
  /** Stock in the tank this morning; null when an earlier day lacks its volume sold. */
  openStock: number | null
  openPmp: number | null
  deliveredLiters: number
  /** openStock + deliveries. */
  available: number | null
  /** Weighted average cost after the day's deliveries, p4. */
  pmp: number | null
  /** Pump price, p3; carried over from the previous day when not typed. */
  price: number | null
  priceCarried: boolean
  priceHt: number | null
  /** priceHt - pmp, p4 per liter. */
  margin: number | null
  sold: number | null
  closeStock: number | null
  marginCents: number | null
  costCents: number | null
  /** The theoretical stock went below zero: a volume or a correction is wrong. */
  negativeStock: boolean
}

/** Integer division rounded half away from zero. `b` must be > 0. */
export function rdiv(a: number, b: number): number {
  const abs = Math.abs(a)
  const q = Math.floor(abs / b)
  const res = 2 * (abs - q * b) >= b ? q + 1 : q
  return a < 0 && res !== 0 ? -res : res
}

/** Pump price incl. VAT (p3) → price excl. VAT (p4). */
export function priceExclVat(pumpPrice: number): number {
  return rdiv(pumpPrice * 10 * 100, 100 + VAT_PERCENT)
}

/**
 * Lowest pump price (p3) that does not sell below `pmp` (p4): PMP + VAT,
 * rounded UP to the tenth of a cent so the margin is never negative.
 */
export function costPumpPrice(pmp: number): number {
  const den = 10 * 100
  return Math.floor((pmp * (100 + VAT_PERCENT) + den - 1) / den)
}

/** Margin rate on cost, in tenths of a percent (52 = 5.2 %). */
export function marginRateTenths(margin: number, cost: number): number | null {
  return cost > 0 ? rdiv(margin * 1000, cost) : null
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  )
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

export type ParsedDecimal =
  | { kind: 'empty' }
  | { kind: 'invalid' }
  | { kind: 'too_many_decimals' }
  | { kind: 'ok'; value: number }

/**
 * Parses "1 234,5" / "1234.5" into an integer with `decimals` implied
 * decimals, without going through floating point.
 */
export function parseDecimal(input: string, decimals: number): ParsedDecimal {
  const s = input.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.')
  if (s === '') return { kind: 'empty' }
  if (!/^\d+(\.\d+)?$/.test(s)) return { kind: 'invalid' }
  const [int, frac = ''] = s.split('.')
  if (frac.length > decimals) return { kind: 'too_many_decimals' }
  const value =
    Number(int) * 10 ** decimals +
    (decimals ? Number(frac.padEnd(decimals, '0')) : 0)
  return Number.isSafeInteger(value)
    ? { kind: 'ok', value }
    : { kind: 'invalid' }
}

/**
 * One row per calendar day, from the first starting stock to `until` (or the
 * last entry if later). A day nobody filled in is still a row, so a missing
 * volume shows up instead of being skipped. Entries before the first starting
 * stock are ignored.
 */
export function computeLedger(
  entries: ReadonlyArray<FuelEntry>,
  until: string,
): Array<FuelRow> {
  const byDate = new Map(entries.map((e) => [e.date, e]))
  const dates = entries.map((e) => e.date).sort()
  const start = dates.find((d) => byDate.get(d)?.fixStock !== undefined)
  if (start === undefined) return []
  const last = dates[dates.length - 1]
  const end = last > until ? last : until

  const rows: Array<FuelRow> = []
  let stock: number | null = null
  let pmp: number | null = null
  let price: number | null = null
  for (let date = start; date <= end; date = addDays(date, 1)) {
    const entry = byDate.get(date) ?? null
    const fixStock = entry?.fixStock
    const fixPmp = entry?.fixPmp
    const fixed = fixStock !== undefined && fixPmp !== undefined
    const openStock: number | null = fixed ? fixStock : stock
    const openPmp: number | null = fixed ? fixPmp : pmp

    let deliveredLiters = 0
    let deliveredValue = 0
    for (const d of entry?.deliveries ?? []) {
      deliveredLiters += d.liters
      deliveredValue += d.liters * d.price
    }
    const available: number | null =
      openStock === null ? null : openStock + deliveredLiters
    const negativeStock = openStock !== null && openStock < 0

    let dayPmp: number | null
    if (deliveredLiters === 0) dayPmp = openPmp
    else if (openStock === null || negativeStock || openPmp === null)
      dayPmp = null
    else
      dayPmp = rdiv(
        openStock * openPmp + deliveredValue,
        openStock + deliveredLiters,
      )

    const dayPrice: number | null = entry?.price ?? price
    const priceHt = dayPrice === null ? null : priceExclVat(dayPrice)
    const margin = priceHt === null || dayPmp === null ? null : priceHt - dayPmp
    const sold = entry?.sold ?? null
    const closeStock: number | null =
      available === null || sold === null ? null : available - sold

    rows.push({
      date,
      entry,
      fixed,
      openStock,
      openPmp,
      deliveredLiters,
      available,
      pmp: dayPmp,
      price: dayPrice,
      priceCarried: entry?.price === undefined,
      priceHt,
      margin,
      sold,
      closeStock,
      marginCents:
        margin === null || sold === null ? null : rdiv(margin * sold, 100),
      costCents:
        dayPmp === null || sold === null ? null : rdiv(dayPmp * sold, 100),
      negativeStock,
    })
    stock = closeStock
    pmp = dayPmp
    price = dayPrice
  }
  return rows
}

export type FuelTotals = {
  sold: number
  marginCents: number
  costCents: number
  /** Volume-weighted margin, p4 per liter. */
  marginPerLiter: number | null
  marginRateTenths: number | null
}

/** Totals over the rows whose margin is known (volume sold typed). */
export function summarize(rows: ReadonlyArray<FuelRow>): FuelTotals {
  let sold = 0
  let marginCents = 0
  let costCents = 0
  for (const r of rows) {
    if (r.marginCents === null || r.costCents === null || r.sold === null)
      continue
    sold += r.sold
    marginCents += r.marginCents
    costCents += r.costCents
  }
  return {
    sold,
    marginCents,
    costCents,
    marginPerLiter: sold > 0 ? rdiv(marginCents * 100, sold) : null,
    marginRateTenths: marginRateTenths(marginCents, costCents),
  }
}
