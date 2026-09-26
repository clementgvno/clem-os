import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { FUEL_LIMITS, parseDecimal } from '../../../convex/lib/fuel'
import { useFormatters } from './format'
import type { FormEvent, ReactNode } from 'react'
import type { TFunction } from 'i18next'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { cn } from '~/lib/utils'

/** Client-side bounds, mirroring the checks of `convex/fuel.ts`. */
export function useRangeChecks() {
  const { t } = useTranslation('fuel')
  const fmt = useFormatters()
  return useMemo(() => {
    const range = (min: string, max: string) =>
      t('validation.range', { min, max })
    return {
      liters: (v: number) =>
        v > FUEL_LIMITS.maxLiters
          ? range('0', fmt.liters(FUEL_LIMITS.maxLiters))
          : null,
      unitPrice: (v: number) =>
        v < FUEL_LIMITS.minUnitPrice || v > FUEL_LIMITS.maxUnitPrice
          ? range(
              fmt.unit(FUEL_LIMITS.minUnitPrice),
              fmt.unit(FUEL_LIMITS.maxUnitPrice),
            )
          : null,
      pumpPrice: (v: number) =>
        v < FUEL_LIMITS.minPumpPrice || v > FUEL_LIMITS.maxPumpPrice
          ? range(
              fmt.pump(FUEL_LIMITS.minPumpPrice),
              fmt.pump(FUEL_LIMITS.maxPumpPrice),
            )
          : null,
    }
  }, [t, fmt])
}

type Check = (v: number) => string | null

/** Parses a required field; returns the value, or the message to show. */
function readField(
  raw: string,
  decimals: number,
  check: Check,
  t: TFunction<'fuel'>,
): { value: number } | { error: string } {
  const parsed = parseDecimal(raw, decimals)
  if (parsed.kind === 'empty') return { error: t('validation.required') }
  if (parsed.kind === 'invalid') return { error: t('validation.invalid') }
  if (parsed.kind === 'too_many_decimals') {
    return {
      error:
        decimals === 0
          ? t('validation.integer')
          : t('validation.decimals', { count: decimals }),
    }
  }
  const error = check(parsed.value)
  return error ? { error } : { value: parsed.value }
}

function FormField({
  id,
  label,
  unit,
  value,
  error,
  onChange,
  autoFocus,
}: {
  id: string
  label: string
  unit: string
  value: string
  error: string | undefined
  onChange: (v: string) => void
  autoFocus?: boolean
}) {
  return (
    <div>
      <div className="relative">
        <Input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          autoFocus={autoFocus}
          aria-label={label}
          placeholder={label}
          aria-invalid={error ? true : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 pr-8 text-right text-sm tabular-nums"
        />
        <span className="text-muted-foreground pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs">
          {unit}
        </span>
      </div>
      {error && <p className="text-destructive mt-1 text-xs">{error}</p>}
    </div>
  )
}

/**
 * Two required numbers submitted together: liters + a p4 price. Used for a
 * delivery (liters, purchase price) and for the stock (liters, PMP).
 */
export function LitersPriceForm({
  idPrefix,
  initialLiters = '',
  initialPrice = '',
  priceLabel,
  submitLabel,
  onSubmit,
  onCancel,
  extra,
  className,
}: {
  idPrefix: string
  initialLiters?: string
  initialPrice?: string
  priceLabel: string
  submitLabel: string
  onSubmit: (liters: number, price: number) => Promise<unknown>
  onCancel?: () => void
  extra?: ReactNode
  className?: string
}) {
  const { t } = useTranslation('fuel')
  const checks = useRangeChecks()
  const [liters, setLiters] = useState(initialLiters)
  const [price, setPrice] = useState(initialPrice)
  const [errors, setErrors] = useState<{ liters?: string; price?: string }>({})
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const l = readField(liters, 0, checks.liters, t)
    const p = readField(price, 4, checks.unitPrice, t)
    const next = {
      liters: 'error' in l ? l.error : undefined,
      price: 'error' in p ? p.error : undefined,
    }
    setErrors(next)
    if ('error' in l || 'error' in p) return
    setSaving(true)
    try {
      await onSubmit(l.value, p.value)
    } catch {
      // Toasted by the caller; keep what was typed.
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={(e) => void submit(e)}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && onCancel) onCancel()
      }}
      className={cn('grid grid-cols-2 gap-1.5', className)}
    >
      <FormField
        id={`${idPrefix}-liters`}
        label={t('placeholders.liters')}
        unit="L"
        value={liters}
        error={errors.liters}
        onChange={setLiters}
        autoFocus
      />
      <FormField
        id={`${idPrefix}-price`}
        label={priceLabel}
        unit="€"
        value={price}
        error={errors.price}
        onChange={setPrice}
      />
      <div className="col-span-full flex flex-wrap items-center gap-1.5">
        <Button type="submit" size="sm" disabled={saving}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            {t('actions.cancel')}
          </Button>
        )}
        {extra}
      </div>
    </form>
  )
}
