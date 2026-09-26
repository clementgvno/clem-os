import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { X } from 'lucide-react'

import {
  FUEL_PRODUCTS,
  addDays,
  costPumpPrice,
  marginRateTenths,
} from '../../../convex/lib/fuel'
import { NumberField } from './NumberField'
import { ProductMark } from './ProductMark'
import { LitersPriceForm, useRangeChecks } from './forms'
import { signClass, useFormatters } from './format'
import type { ReactNode } from 'react'
import type { FuelActions, FuelData } from './useFuel'
import type { FuelProduct, FuelRow } from '../../../convex/lib/fuel'
import { cn } from '~/lib/utils'

// One grid for the header and every row, so columns line up. Wide enough
// (container, not viewport: the sidebar and AI panel eat the width) → one
// line per product; otherwise → a two-column card.
const GRID = cn(
  'grid grid-cols-2 gap-x-4 gap-y-3',
  '[grid-template-areas:"prod_margin"_"sold_stock"_"price_pmp"_"deliv_deliv"]',
  '@min-[60rem]:grid-cols-[92px_124px_128px_minmax(150px,1fr)_76px_132px_124px]',
  '@min-[60rem]:[grid-template-areas:"prod_sold_stock_deliv_pmp_price_margin"]',
)
const LABEL =
  'text-muted-foreground mb-1 text-[11px] font-medium tracking-wide uppercase @min-[60rem]:hidden'
const RIGHT = '@min-[60rem]:text-right'
const BIG = 'flex h-9 items-center text-base font-semibold tabular-nums'
const SUB =
  'text-muted-foreground mt-1 flex flex-wrap items-center gap-1.5 text-xs'
const LINK =
  'text-muted-foreground hover:text-foreground border-b border-dashed border-current text-xs'

type Props = {
  date: string
  today: string
  data: FuelData
  actions: FuelActions
  onGoto: (date: string) => void
}

export function FuelDayView({ date, today, data, actions, onGoto }: Props) {
  const { t } = useTranslation('fuel')
  const fmt = useFormatters()
  const yesterday = addDays(date, -1)

  const products = FUEL_PRODUCTS.map((product) => {
    const ledger = data.ledgers.get(product) ?? []
    return {
      product,
      ledger,
      row: ledger.find((r) => r.date === date) ?? null,
      yRow: ledger.find((r) => r.date === yesterday) ?? null,
    }
  })
  const started = products.some((p) => p.ledger.length > 0)

  // Days before yesterday still waiting for their volume sold (only on today's
  // screen: yesterday's is the field right there).
  const missing = new Map<string, Array<FuelProduct>>()
  if (date === today) {
    for (const { product, ledger } of products) {
      for (const r of ledger) {
        if (r.date < yesterday && r.sold === null) {
          missing.set(r.date, [...(missing.get(r.date) ?? []), product])
        }
      }
    }
  }
  const missingList = [...missing.entries()].sort(([a], [b]) =>
    a < b ? -1 : 1,
  )

  let ySold = 0
  let yMargin = 0
  let yKnown = 0
  for (const { yRow } of products) {
    if (yRow?.marginCents == null || yRow.sold === null) continue
    ySold += yRow.sold
    yMargin += yRow.marginCents
    yKnown += 1
  }

  return (
    <div className="space-y-3">
      {!started && (
        <p className="text-muted-foreground text-sm">{t('start.hint')}</p>
      )}
      {missingList.length > 0 && (
        <div className="bg-warning-muted text-warning flex flex-wrap items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium">
          <span>{t('missingBanner')}</span>
          {missingList.slice(0, 6).map(([d, ps]) => (
            <button
              key={d}
              type="button"
              onClick={() => onGoto(addDays(d, 1))}
              className="bg-background text-foreground hover:bg-accent rounded-full px-2.5 py-0.5 text-xs"
            >
              {fmt.shortDay(d)} · {ps.map((p) => t(`products.${p}`)).join(', ')}
            </button>
          ))}
          {missingList.length > 6 && <span>+{missingList.length - 6}</span>}
        </div>
      )}

      <div className="bg-card @container rounded-xl border">
        <div
          className={cn(
            GRID,
            'hidden @min-[60rem]:grid',
            'text-muted-foreground border-b px-5 py-2.5 text-[11px] font-medium tracking-wide uppercase',
          )}
        >
          <span>{t('columns.product')}</span>
          <span className="text-right">
            {t('columns.soldOn', { day: fmt.shortDay(yesterday) })}
          </span>
          <span className="text-right">{t('columns.stock')}</span>
          <span>{t('columns.deliveries')}</span>
          <span className="text-right">{t('columns.pmp')}</span>
          <span className="text-right">{t('columns.price')}</span>
          <span className="text-right">{t('columns.margin')}</span>
        </div>

        <div className="divide-y">
          {products.map((p) => (
            <DayRow
              key={`${p.product}:${date}`}
              product={p.product}
              ledger={p.ledger}
              row={p.row}
              yRow={p.yRow}
              date={date}
              yesterday={yesterday}
              actions={actions}
              onGoto={onGoto}
            />
          ))}
        </div>

        {yKnown > 0 && (
          <div className="text-muted-foreground flex flex-wrap justify-end gap-x-7 gap-y-1 border-t px-5 py-3 text-sm">
            <span>
              {t('dayTotals.sold', { day: fmt.shortDay(yesterday) })}
              <b className="text-foreground ml-1.5 font-semibold tabular-nums">
                {fmt.liters(ySold)} L
              </b>
            </span>
            <span>
              {t('dayTotals.margin', { day: fmt.shortDay(yesterday) })}
              <b
                className={cn(
                  'ml-1.5 font-semibold tabular-nums',
                  signClass(yMargin),
                )}
              >
                {fmt.euros(yMargin)}
              </b>
            </span>
            {yKnown < FUEL_PRODUCTS.length && (
              <span>
                {t('dayTotals.partial', {
                  count: yKnown,
                  total: FUEL_PRODUCTS.length,
                })}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function DayRow({
  product,
  ledger,
  row,
  yRow,
  date,
  yesterday,
  actions,
  onGoto,
}: {
  product: FuelProduct
  ledger: Array<FuelRow>
  row: FuelRow | null
  yRow: FuelRow | null
  date: string
  yesterday: string
  actions: FuelActions
  onGoto: (date: string) => void
}) {
  const { t } = useTranslation('fuel')
  const fmt = useFormatters()
  const checks = useRangeChecks()
  const [fixing, setFixing] = useState(false)
  const [adding, setAdding] = useState(false)
  const name = t(`products.${product}`)
  const id = (field: string) => `fuel-${product}-${field}`

  // --- Stock this morning -------------------------------------------------
  let stockCell: ReactNode
  if (!row || fixing) {
    const isStart = ledger[0]?.date === date
    stockCell = (
      <div>
        {!row && (
          <p className="text-muted-foreground mb-1 text-xs">
            {t('start.label')}
          </p>
        )}
        <LitersPriceForm
          idPrefix={id('stock')}
          initialLiters={
            row?.openStock != null ? fmt.inputLiters(row.openStock) : ''
          }
          initialPrice={row?.openPmp != null ? fmt.inputUnit(row.openPmp) : ''}
          priceLabel={t('placeholders.pmp')}
          submitLabel={t('actions.ok')}
          onSubmit={async (stock, pmp) => {
            await actions.setStock(product, date, stock, pmp)
            setFixing(false)
          }}
          onCancel={row ? () => setFixing(false) : undefined}
          className="grid-cols-1"
          extra={
            row?.fixed && !isStart ? (
              <button
                type="button"
                className={LINK}
                onClick={() =>
                  void actions.clearStock(product, date).then(
                    () => setFixing(false),
                    () => {},
                  )
                }
              >
                {t('stock.backToComputed')}
              </button>
            ) : null
          }
        />
      </div>
    )
  } else if (row.openStock === null) {
    const gap = [...ledger]
      .reverse()
      .find((r) => r.date < date && r.sold === null)
    stockCell = (
      <>
        <div
          className={cn(
            BIG,
            'text-muted-foreground',
            '@min-[60rem]:justify-end',
          )}
        >
          —
        </div>
        {gap && gap.date !== yesterday && (
          <div className={cn(SUB, '@min-[60rem]:justify-end')}>
            <button
              type="button"
              className={cn(LINK, 'text-warning')}
              onClick={() => onGoto(addDays(gap.date, 1))}
            >
              {t('stock.missing', { day: fmt.shortDay(gap.date) })}
            </button>
          </div>
        )}
      </>
    )
  } else {
    stockCell = (
      <>
        <div
          className={cn(
            BIG,
            'font-medium',
            '@min-[60rem]:justify-end',
            row.negativeStock && 'text-destructive',
          )}
        >
          {fmt.liters(row.openStock)}
          <span className="text-muted-foreground ml-1 text-xs font-normal">
            L
          </span>
        </div>
        <div className={cn(SUB, '@min-[60rem]:justify-end')}>
          {row.negativeStock ? (
            <span className="text-destructive">{t('stock.negative')}</span>
          ) : row.openPmp !== null ? (
            <span>{t('stock.at', { pmp: fmt.unit(row.openPmp) })}</span>
          ) : null}
          {row.fixed && ledger[0]?.date !== date && (
            <span className="bg-muted rounded-full border px-1.5 text-[11px]">
              {t('stock.fixed')}
            </span>
          )}
          <button
            type="button"
            className={LINK}
            onClick={() => setFixing(true)}
          >
            {t('stock.fix')}
          </button>
        </div>
      </>
    )
  }

  // --- Deliveries -----------------------------------------------------------
  const deliveries = row?.entry?.deliveries ?? []
  const chips = deliveries.map((d, i) => (
    <span
      key={`${i}-${d.liters}-${d.price}`}
      className="bg-muted inline-flex h-7 items-center gap-1 rounded-full border pr-1 pl-2.5 text-xs whitespace-nowrap"
    >
      <span className="tabular-nums">
        {t('delivery.item', {
          liters: fmt.liters(d.liters),
          price: fmt.unit(d.price),
        })}
      </span>
      <button
        type="button"
        aria-label={t('delivery.remove')}
        className="text-muted-foreground hover:bg-accent hover:text-foreground grid size-5 place-items-center rounded-full"
        onClick={() =>
          void actions.removeDelivery(product, date, i, d.liters, d.price).then(
            () =>
              toast(t('delivery.removed'), {
                action: {
                  label: t('actions.undo'),
                  onClick: () =>
                    void actions
                      .addDelivery(product, date, d.liters, d.price)
                      .catch(() => {}),
                },
              }),
            () => {},
          )
        }
      >
        <X className="size-3" />
      </button>
    </span>
  ))
  const delivCell = !row ? null : adding ? (
    <div className="space-y-1.5">
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">{chips}</div>
      )}
      <LitersPriceForm
        idPrefix={id('delivery')}
        priceLabel={t('placeholders.purchase')}
        submitLabel={t('delivery.submit')}
        onSubmit={async (liters, price) => {
          await actions.addDelivery(product, date, liters, price)
          setAdding(false)
          const ref = row.openPmp
          if (ref && Math.abs(price - ref) * 100 > ref * 15) {
            toast.warning(t('delivery.farFromPmp', { product: name }))
          }
        }}
        onCancel={() => setAdding(false)}
      />
    </div>
  ) : (
    <div className="flex min-h-9 flex-wrap items-center gap-1.5">
      {chips}
      <button
        type="button"
        onClick={() => setAdding(true)}
        className="text-muted-foreground hover:text-foreground hover:border-ring h-7 rounded-full border border-dashed px-2.5 text-xs"
      >
        {t('delivery.add')}
      </button>
    </div>
  )

  // --- PMP, price, margin ---------------------------------------------------
  const pmpDelta =
    row && row.deliveredLiters > 0 && row.pmp !== null && row.openPmp !== null
      ? row.pmp - row.openPmp
      : 0
  const cost = row?.pmp ? costPumpPrice(row.pmp) : null

  return (
    <div className={cn(GRID, 'px-4 py-4', '@min-[60rem]:px-5')}>
      <div className="flex h-9 items-center gap-2.5 font-semibold [grid-area:prod]">
        <ProductMark product={product} />
        <span>{name}</span>
      </div>

      <div className={cn('[grid-area:sold]', RIGHT)}>
        <div className={LABEL}>
          {t('columns.soldOn', { day: fmt.shortDay(yesterday) })}
        </div>
        {yRow ? (
          <>
            <NumberField
              id={id('sold')}
              label={`${name} · ${t('columns.soldOn', { day: fmt.shortDay(yesterday) })}`}
              value={yRow.sold !== null ? fmt.inputLiters(yRow.sold) : ''}
              unit="L"
              decimals={0}
              placeholder={t('placeholders.counter')}
              tone={yRow.sold === null ? 'missing' : 'default'}
              validate={(v) =>
                checks.liters(v) ??
                (yRow.available !== null && v > yRow.available
                  ? t('validation.soldExceeds', {
                      liters: fmt.liters(yRow.available),
                    })
                  : null)
              }
              onCommit={(v) => actions.setSold(product, yesterday, v)}
            />
            {yRow.marginCents !== null && (
              <div
                className={cn(
                  SUB,
                  '@min-[60rem]:justify-end',
                  signClass(yRow.marginCents),
                )}
              >
                {fmt.euros(yRow.marginCents)}
              </div>
            )}
          </>
        ) : (
          <div
            className={cn(
              BIG,
              'text-muted-foreground',
              '@min-[60rem]:justify-end',
            )}
          >
            —
          </div>
        )}
      </div>

      <div className={cn('[grid-area:stock]', !fixing && row && RIGHT)}>
        <div className={LABEL}>{t('columns.stock')}</div>
        {stockCell}
      </div>

      <div className="[grid-area:deliv]">
        <div className={LABEL}>{t('columns.deliveries')}</div>
        {delivCell}
      </div>

      <div className={cn('[grid-area:pmp]', RIGHT)}>
        <div className={LABEL}>{t('columns.pmp')}</div>
        <div
          className={cn(
            BIG,
            '@min-[60rem]:justify-end',
            row?.pmp == null && 'text-muted-foreground',
          )}
        >
          {row?.pmp != null ? fmt.unit(row.pmp) : '—'}
        </div>
        {pmpDelta !== 0 && (
          <div
            className={cn(
              SUB,
              '@min-[60rem]:justify-end',
              pmpDelta > 0 ? 'text-destructive' : 'text-positive',
            )}
          >
            {pmpDelta > 0 ? '▲' : '▼'} {fmt.unit(Math.abs(pmpDelta))}
          </div>
        )}
      </div>

      <div className={cn('[grid-area:price]', RIGHT)}>
        <div className={LABEL}>{t('columns.price')}</div>
        {row && (
          <>
            <NumberField
              id={id('price')}
              label={`${name} · ${t('columns.price')}`}
              value={row.price !== null ? fmt.inputPump(row.price) : ''}
              unit="€"
              decimals={3}
              placeholder={t('placeholders.pump')}
              tone={
                row.priceCarried && row.price !== null ? 'carried' : 'default'
              }
              validate={checks.pumpPrice}
              onCommit={(v) => actions.setPrice(product, date, v)}
            />
            <div className={cn(SUB, '@min-[60rem]:justify-end')}>
              <button
                type="button"
                title={t('price.costTitle')}
                disabled={cost === null}
                onClick={() => {
                  if (cost !== null)
                    void actions.setPrice(product, date, cost).catch(() => {})
                }}
                className={cn(
                  'rounded-full border px-2 py-px text-xs disabled:opacity-40',
                  cost !== null && row.price === cost
                    ? 'bg-foreground text-background border-foreground'
                    : 'bg-muted text-muted-foreground hover:text-foreground hover:border-ring',
                )}
              >
                {t('price.cost', {
                  price: cost !== null ? fmt.pump(cost) : '',
                })}
              </button>
            </div>
          </>
        )}
      </div>

      <div className="text-right [grid-area:margin]">
        {row?.margin != null && row.pmp !== null ? (
          <>
            <div
              className={cn(BIG, 'justify-end gap-1', signClass(row.margin))}
            >
              {fmt.signedUnit(row.margin)}
              <span className="text-muted-foreground text-xs font-medium">
                {t('margin.perLiter')}
              </span>
            </div>
            <div className={cn(SUB, 'justify-end')}>
              {row.margin < 0 && (
                <span className="bg-destructive/10 text-destructive rounded-full px-2 py-px text-[11px] font-medium">
                  {t('margin.belowCost')}
                </span>
              )}
              <span>{fmt.rate(marginRateTenths(row.margin, row.pmp))}</span>
            </div>
          </>
        ) : (
          <div className={cn(BIG, 'text-muted-foreground justify-end')}>—</div>
        )}
      </div>
    </div>
  )
}
