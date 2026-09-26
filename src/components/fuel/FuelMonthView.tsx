import { Fragment, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ChevronRight, Download } from 'lucide-react'

import { FUEL_PRODUCTS, summarize } from '../../../convex/lib/fuel'
import { ProductMark } from './ProductMark'
import { exportMonthXlsx } from './exportXlsx'
import { signClass, useFormatters } from './format'
import type { FuelData } from './useFuel'
import type { FuelProduct, FuelRow } from '../../../convex/lib/fuel'
import { Button } from '~/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table'
import { cn } from '~/lib/utils'

export function FuelMonthView({
  month,
  data,
}: {
  month: string
  data: FuelData
}) {
  const { t } = useTranslation('fuel')
  const fmt = useFormatters()
  const [open, setOpen] = useState<Set<FuelProduct>>(new Set())
  const [exporting, setExporting] = useState(false)

  const products = FUEL_PRODUCTS.map((product) => {
    const rows = (data.ledgers.get(product) ?? []).filter((r) =>
      r.date.startsWith(month),
    )
    return { product, rows, totals: summarize(rows) }
  })
  const withData = products.filter((p) => p.rows.length > 0)
  if (withData.length === 0) {
    return (
      <div className="text-muted-foreground rounded-xl border border-dashed px-5 py-12 text-center text-sm">
        {t('month.empty')}
      </div>
    )
  }
  const all = summarize(withData.flatMap((p) => p.rows))

  const toggle = (p: FuelProduct) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(p)) next.delete(p)
      else next.add(p)
      return next
    })

  async function onExport() {
    setExporting(true)
    try {
      await exportMonthXlsx({ month, products, authors: data.authors, t, fmt })
    } catch {
      toast.error(t('export.failed'))
    } finally {
      setExporting(false)
    }
  }

  const kpis = [
    { label: t('month.sold'), value: `${fmt.liters(all.sold)} L`, tone: '' },
    {
      label: t('month.margin'),
      value: fmt.euros(all.marginCents),
      tone: signClass(all.marginCents),
    },
    {
      label: t('month.average'),
      value:
        all.marginPerLiter === null
          ? '—'
          : `${fmt.signedUnit(all.marginPerLiter)} ${t('margin.perLiter')} · ${fmt.rate(all.marginRateTenths)}`,
      tone: '',
    },
  ]

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {kpis.map((k) => (
          <div key={k.label} className="bg-card rounded-xl border px-5 py-4">
            <div className="text-muted-foreground text-xs font-medium">
              {k.label}
            </div>
            <div
              className={cn('mt-1 text-xl font-semibold tabular-nums', k.tone)}
            >
              {k.value}
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          disabled={exporting}
          onClick={() => void onExport()}
        >
          <Download />
          {t('month.export')}
        </Button>
      </div>

      <div className="bg-card rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">{t('columns.product')}</TableHead>
              <TableHead className="text-right">{t('month.sold')}</TableHead>
              <TableHead className="text-right">
                {t('month.marginPerLiter')}
              </TableHead>
              <TableHead className="text-right">
                {t('month.marginRate')}
              </TableHead>
              <TableHead className="pr-4 text-right">
                {t('month.margin')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {withData.map(({ product, rows, totals }) => {
              const isOpen = open.has(product)
              return (
                <Fragment key={product}>
                  <TableRow
                    className="cursor-pointer"
                    onClick={() => toggle(product)}
                  >
                    <TableCell className="pl-4">
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        aria-label={t('month.showDays')}
                        className="flex items-center gap-2.5 font-semibold"
                      >
                        <ChevronRight
                          className={cn(
                            'text-muted-foreground size-4 transition-transform motion-reduce:transition-none',
                            isOpen && 'rotate-90',
                          )}
                        />
                        <ProductMark product={product} />
                        {t(`products.${product}`)}
                      </button>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmt.liters(totals.sold)} L
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right tabular-nums',
                        signClass(totals.marginPerLiter),
                      )}
                    >
                      {totals.marginPerLiter === null
                        ? '—'
                        : fmt.signedUnit(totals.marginPerLiter)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmt.rate(totals.marginRateTenths)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'pr-4 text-right font-semibold tabular-nums',
                        signClass(totals.marginCents),
                      )}
                    >
                      {fmt.euros(totals.marginCents)}
                    </TableCell>
                  </TableRow>
                  {isOpen && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={5} className="bg-muted/40 p-0">
                        <DaysTable
                          product={product}
                          rows={rows}
                          authors={data.authors}
                        />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              )
            })}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell className="pl-4">{t('month.total')}</TableCell>
              <TableCell className="text-right tabular-nums">
                {fmt.liters(all.sold)} L
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {all.marginPerLiter === null
                  ? '—'
                  : fmt.signedUnit(all.marginPerLiter)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {fmt.rate(all.marginRateTenths)}
              </TableCell>
              <TableCell
                className={cn(
                  'pr-4 text-right tabular-nums',
                  signClass(all.marginCents),
                )}
              >
                {fmt.euros(all.marginCents)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </div>
  )
}

function DaysTable({
  product,
  rows,
  authors,
}: {
  product: FuelProduct
  rows: Array<FuelRow>
  authors: Map<string, string>
}) {
  const { t } = useTranslation('fuel')
  const fmt = useFormatters()
  const dash = <span className="text-muted-foreground">—</span>
  return (
    <Table className="text-xs">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="pl-4">{t('month.day')}</TableHead>
          <TableHead className="text-right">{t('month.stock')}</TableHead>
          <TableHead className="text-right">{t('month.delivered')}</TableHead>
          <TableHead className="text-right">{t('month.pmp')}</TableHead>
          <TableHead className="text-right">{t('month.price')}</TableHead>
          <TableHead className="text-right">{t('month.sold')}</TableHead>
          <TableHead className="text-right">
            {t('month.marginPerLiter')}
          </TableHead>
          <TableHead className="text-right">{t('month.margin')}</TableHead>
          <TableHead className="pr-4">{t('month.by')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.date} className="tabular-nums hover:bg-transparent">
            <TableCell className="pl-4">{fmt.shortDay(r.date)}</TableCell>
            <TableCell
              className={cn(
                'text-right',
                r.negativeStock && 'text-destructive',
              )}
            >
              {r.openStock === null ? dash : fmt.liters(r.openStock)}
            </TableCell>
            <TableCell className="text-right">
              {r.deliveredLiters ? fmt.liters(r.deliveredLiters) : dash}
            </TableCell>
            <TableCell className="text-right">
              {r.pmp === null ? dash : fmt.unit(r.pmp)}
            </TableCell>
            <TableCell className="text-right">
              {r.price === null ? dash : fmt.pump(r.price)}
            </TableCell>
            <TableCell className="text-right">
              {r.sold === null ? dash : fmt.liters(r.sold)}
            </TableCell>
            <TableCell className={cn('text-right', signClass(r.margin))}>
              {r.margin === null ? dash : fmt.signedUnit(r.margin)}
            </TableCell>
            <TableCell className={cn('text-right', signClass(r.marginCents))}>
              {r.marginCents === null ? dash : fmt.euros(r.marginCents)}
            </TableCell>
            <TableCell className="text-muted-foreground pr-4">
              {r.entry ? authors.get(`${product}:${r.date}`) : ''}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
