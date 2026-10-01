import { useCallback, useMemo } from 'react'
import { useConvexMutation, useConvexQuery } from '@convex-dev/react-query'
import { ConvexError } from 'convex/values'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { api } from '../../../convex/_generated/api'
import { FUEL_PRODUCTS, computeLedger } from '../../../convex/lib/fuel'
import type { Id } from '../../../convex/_generated/dataModel'
import type { FuelEntry, FuelProduct, FuelRow } from '../../../convex/lib/fuel'

export type FuelLedgers = Map<FuelProduct, Array<FuelRow>>

export type FuelData = {
  ledgers: FuelLedgers
  /** Who last saved a given day: key `${product}:${date}`. */
  authors: Map<string, string>
}

/** Every product's ledger up to `until` (at least), or undefined while loading. */
export function useFuelData(
  orgId: Id<'organizations'> | undefined,
  until: string,
): FuelData | undefined {
  const list = useConvexQuery(api.fuel.list, orgId ? { orgId } : 'skip')
  return useMemo(() => {
    if (!list) return undefined
    const entries = new Map<FuelProduct, Array<FuelEntry>>(
      FUEL_PRODUCTS.map((p) => [p, []]),
    )
    const authors = new Map<string, string>()
    for (const e of list) {
      entries.get(e.product)?.push(e)
      authors.set(`${e.product}:${e.date}`, e.updatedByName)
    }
    const ledgers: FuelLedgers = new Map(
      FUEL_PRODUCTS.map((p) => [p, computeLedger(entries.get(p) ?? [], until)]),
    )
    return { ledgers, authors }
  }, [list, until])
}

/** Mutations wrapped with a translated error toast; they still reject on error. */
export function useFuelActions(orgId: Id<'organizations'>) {
  const { t } = useTranslation('fuel')
  const setPrice = useConvexMutation(api.fuel.setPrice)
  const addDelivery = useConvexMutation(api.fuel.addDelivery)
  const removeDelivery = useConvexMutation(api.fuel.removeDelivery)
  const setStock = useConvexMutation(api.fuel.setStock)

  const run = useCallback(
    async (promise: Promise<unknown>) => {
      try {
        await promise
      } catch (err) {
        const code = err instanceof ConvexError ? String(err.data) : ''
        toast.error(t(`errors.${code}`, { defaultValue: t('errors.generic') }))
        throw err
      }
    },
    [t],
  )

  return useMemo(() => {
    const day = (product: FuelProduct, date: string) => ({
      orgId,
      product,
      date,
    })
    return {
      setPrice: (product: FuelProduct, date: string, price: number | null) =>
        run(setPrice({ ...day(product, date), price })),
      addDelivery: (
        product: FuelProduct,
        date: string,
        liters: number,
        price: number,
      ) => run(addDelivery({ ...day(product, date), liters, price })),
      removeDelivery: (
        product: FuelProduct,
        date: string,
        index: number,
        liters: number,
        price: number,
      ) => run(removeDelivery({ ...day(product, date), index, liters, price })),
      /** Morning stock; with `pmp`, the starting stock or a PMP correction. */
      setStock: (
        product: FuelProduct,
        date: string,
        stock: number | null,
        pmp?: number,
      ) => run(setStock({ ...day(product, date), stock, pmp })),
    }
  }, [orgId, run, setPrice, addDelivery, removeDelivery, setStock])
}

export type FuelActions = ReturnType<typeof useFuelActions>
