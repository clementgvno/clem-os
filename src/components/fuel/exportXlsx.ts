import { summarize } from '../../../convex/lib/fuel'
import type { FuelFormatters } from './format'
import type { FuelProduct, FuelRow } from '../../../convex/lib/fuel'
import type { TFunction } from 'i18next'

type ProductMonth = { product: FuelProduct; rows: Array<FuelRow> }

type Cell = {
  value?: string | number
  type?: StringConstructor | NumberConstructor
  format?: string
  fontWeight?: 'bold'
} | null

const num = (value: number | null, format: string): Cell =>
  value === null ? null : { value, type: Number, format }
const text = (value: string, bold = false): Cell => ({
  value,
  type: String,
  ...(bold ? { fontWeight: 'bold' as const } : {}),
})

const LITERS = '#,##0'
const UNIT = '0.0000'
const PUMP = '0.000'
const EUROS = '#,##0.00'
const RATE = '0.0%'

/**
 * Month export: a summary sheet, then one sheet per product with the day-by-day
 * detail. Numbers are real numbers (not text) so the accountant can sum them;
 * they come from the same ledger as the screen.
 */
export async function exportMonthXlsx({
  month,
  products,
  authors,
  t,
  fmt,
}: {
  month: string
  products: Array<ProductMonth>
  authors: Map<string, string>
  t: TFunction<'fuel'>
  fmt: FuelFormatters
}) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')

  const withData = products.filter((p) => p.rows.length > 0)
  const totalsRow = (
    label: string,
    rows: Array<FuelRow>,
    bold = false,
  ): Array<Cell> => {
    const s = summarize(rows)
    return [
      text(label, bold),
      num(s.sold, LITERS),
      num(s.marginPerLiter === null ? null : s.marginPerLiter / 10_000, UNIT),
      num(
        s.marginRateTenths === null ? null : s.marginRateTenths / 1_000,
        RATE,
      ),
      num(s.marginCents / 100, EUROS),
    ]
  }

  const summary: Array<Array<Cell>> = [
    [
      text(t('columns.product'), true),
      text(`${t('month.sold')} (L)`, true),
      text(t('month.marginPerLiter'), true),
      text(t('month.marginRate'), true),
      text(`${t('month.margin')} (€)`, true),
    ],
    ...withData.map((p) => totalsRow(t(`products.${p.product}`), p.rows)),
    totalsRow(
      t('month.total'),
      withData.flatMap((p) => p.rows),
      true,
    ),
  ]

  const productSheets = withData.map((p) => ({
    sheet: t(`products.${p.product}`),
    columns: [12, 12, 10, 10, 11, 10, 11, 12, 18].map((width) => ({ width })),
    data: [
      [
        t('month.day'),
        `${t('month.stock')} (L)`,
        `${t('month.delivered')} (L)`,
        t('month.pmp'),
        t('month.price'),
        `${t('month.sold')} (L)`,
        t('month.marginPerLiter'),
        `${t('month.margin')} (€)`,
        t('month.by'),
      ].map((h) => text(h, true)),
      ...p.rows.map(
        (r): Array<Cell> => [
          text(fmt.numericDay(r.date)),
          num(r.openStock, LITERS),
          num(r.deliveredLiters || null, LITERS),
          num(r.pmp === null ? null : r.pmp / 10_000, UNIT),
          num(r.price === null ? null : r.price / 1_000, PUMP),
          num(r.sold, LITERS),
          num(r.margin === null ? null : r.margin / 10_000, UNIT),
          num(r.marginCents === null ? null : r.marginCents / 100, EUROS),
          r.entry ? text(authors.get(`${p.product}:${r.date}`) ?? '') : null,
        ],
      ),
    ],
  }))

  await writeXlsxFile([
    {
      sheet: t('export.summary'),
      columns: [14, 12, 12, 10, 14].map((width) => ({ width })),
      data: summary,
    },
    ...productSheets,
  ]).toFile(t('export.fileName', { month }))
}
