import { ConvexError, v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { fuelProductValidator } from './schema'
import { requireOrgMember } from './lib/auth'
import { FUEL_LIMITS, addDays, computeLedger, isIsoDate } from './lib/fuel'
import type { MutationCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import type { FuelDelivery, FuelEntry, FuelProduct } from './lib/fuel'

// Fuel margin module. The client computes the ledger from `list` with the
// same engine the mutations use for their checks (`convex/lib/fuel.ts`).

const MAX_DELIVERIES_PER_DAY = 20

type DayKey = {
  orgId: Id<'organizations'>
  product: FuelProduct
  date: string
}

type DayFields = {
  sold?: number
  price?: number
  deliveries: Array<FuelDelivery>
  fixStock?: number
  fixPmp?: number
}

const dayArgs = {
  orgId: v.id('organizations'),
  product: fuelProductValidator,
  date: v.string(),
}

function toEntry(doc: Doc<'fuelDays'>): FuelEntry {
  return {
    date: doc.date,
    sold: doc.sold,
    price: doc.price,
    deliveries: doc.deliveries,
    fixStock: doc.fixStock,
    fixPmp: doc.fixPmp,
  }
}

function checkDate(date: string) {
  const tomorrow = addDays(new Date().toISOString().slice(0, 10), 1)
  if (!isIsoDate(date) || date > tomorrow) throw new ConvexError('invalid_date')
}

function checkInt(value: number, min: number, max: number) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ConvexError('invalid_value')
  }
}

async function loadHistory(ctx: MutationCtx, key: DayKey) {
  return await ctx.db
    .query('fuelDays')
    .withIndex('by_org_and_product_and_date', (q) =>
      q.eq('orgId', key.orgId).eq('product', key.product),
    )
    .collect()
}

/** The computed day, or `not_started` when no starting stock precedes it. */
function requireRow(history: Array<Doc<'fuelDays'>>, date: string) {
  const row = computeLedger(history.map(toEntry), date).find(
    (r) => r.date === date,
  )
  if (!row) throw new ConvexError('not_started')
  return row
}

/** Applies `change` to the day and deletes the row once nothing is left in it. */
async function writeDay(
  ctx: MutationCtx,
  key: DayKey,
  history: Array<Doc<'fuelDays'>>,
  userId: Id<'users'>,
  change: (day: DayFields) => DayFields,
) {
  const existing = history.find((d) => d.date === key.date)
  const next = change({
    sold: existing?.sold,
    price: existing?.price,
    deliveries: [...(existing?.deliveries ?? [])],
    fixStock: existing?.fixStock,
    fixPmp: existing?.fixPmp,
  })
  const empty =
    next.sold === undefined &&
    next.price === undefined &&
    next.deliveries.length === 0 &&
    next.fixStock === undefined
  if (empty) {
    if (existing) await ctx.db.delete('fuelDays', existing._id)
    return
  }
  const doc = { ...key, ...next, updatedBy: userId, updatedAt: Date.now() }
  if (existing) await ctx.db.replace('fuelDays', existing._id, doc)
  else await ctx.db.insert('fuelDays', doc)
}

export const list = query({
  args: { orgId: v.id('organizations') },
  handler: async (ctx, { orgId }) => {
    await requireOrgMember(ctx, orgId)
    const docs = await ctx.db
      .query('fuelDays')
      .withIndex('by_org_and_product_and_date', (q) => q.eq('orgId', orgId))
      .collect()
    const names = new Map<Id<'users'>, string>()
    for (const userId of new Set(docs.map((d) => d.updatedBy))) {
      const user = await ctx.db.get('users', userId)
      names.set(userId, user?.name || user?.email || '')
    }
    return docs.map((d) => ({
      ...toEntry(d),
      product: d.product,
      updatedByName: names.get(d.updatedBy) ?? '',
      updatedAt: d.updatedAt,
    }))
  },
})

/** Volume sold that day, read on the pump counter. `null` clears it. */
export const setSold = mutation({
  args: { ...dayArgs, sold: v.union(v.number(), v.null()) },
  handler: async (ctx, { sold, ...key }) => {
    const { user } = await requireOrgMember(ctx, key.orgId)
    checkDate(key.date)
    const history = await loadHistory(ctx, key)
    const row = requireRow(history, key.date)
    if (sold !== null) {
      checkInt(sold, 0, FUEL_LIMITS.maxLiters)
      if (row.available !== null && sold > row.available) {
        throw new ConvexError('sold_exceeds_stock')
      }
    }
    await writeDay(ctx, key, history, user._id, (day) => ({
      ...day,
      sold: sold ?? undefined,
    }))
    return null
  },
})

/** Pump price incl. VAT from that day on. `null` goes back to the previous day's. */
export const setPrice = mutation({
  args: { ...dayArgs, price: v.union(v.number(), v.null()) },
  handler: async (ctx, { price, ...key }) => {
    const { user } = await requireOrgMember(ctx, key.orgId)
    checkDate(key.date)
    if (price !== null) {
      checkInt(price, FUEL_LIMITS.minPumpPrice, FUEL_LIMITS.maxPumpPrice)
    }
    const history = await loadHistory(ctx, key)
    requireRow(history, key.date)
    await writeDay(ctx, key, history, user._id, (day) => ({
      ...day,
      price: price ?? undefined,
    }))
    return null
  },
})

export const addDelivery = mutation({
  args: { ...dayArgs, liters: v.number(), price: v.number() },
  handler: async (ctx, { liters, price, ...key }) => {
    const { user } = await requireOrgMember(ctx, key.orgId)
    checkDate(key.date)
    checkInt(liters, 1, FUEL_LIMITS.maxLiters)
    checkInt(price, FUEL_LIMITS.minUnitPrice, FUEL_LIMITS.maxUnitPrice)
    const history = await loadHistory(ctx, key)
    requireRow(history, key.date)
    await writeDay(ctx, key, history, user._id, (day) => {
      if (day.deliveries.length >= MAX_DELIVERIES_PER_DAY) {
        throw new ConvexError('invalid_value')
      }
      return { ...day, deliveries: [...day.deliveries, { liters, price }] }
    })
    return null
  },
})

/** Removes delivery `index`, only if it still is the one the client saw. */
export const removeDelivery = mutation({
  args: {
    ...dayArgs,
    index: v.number(),
    liters: v.number(),
    price: v.number(),
  },
  handler: async (ctx, { index, liters, price, ...key }) => {
    const { user } = await requireOrgMember(ctx, key.orgId)
    const history = await loadHistory(ctx, key)
    await writeDay(ctx, key, history, user._id, (day) => {
      const target = day.deliveries.at(index)
      if (!target || target.liters !== liters || target.price !== price) {
        throw new ConvexError('stale')
      }
      return {
        ...day,
        deliveries: day.deliveries.filter((_, i) => i !== index),
      }
    })
    return null
  },
})

/** Starting stock, or a correction after a tank dip: stock and PMP this morning. */
export const setStock = mutation({
  args: { ...dayArgs, stock: v.number(), pmp: v.number() },
  handler: async (ctx, { stock, pmp, ...key }) => {
    const { user } = await requireOrgMember(ctx, key.orgId)
    checkDate(key.date)
    checkInt(stock, 0, FUEL_LIMITS.maxLiters)
    checkInt(pmp, FUEL_LIMITS.minUnitPrice, FUEL_LIMITS.maxUnitPrice)
    const history = await loadHistory(ctx, key)
    await writeDay(ctx, key, history, user._id, (day) => ({
      ...day,
      fixStock: stock,
      fixPmp: pmp,
    }))
    return null
  },
})

/** Drops a correction so the stock is computed again. The starting stock stays. */
export const clearStock = mutation({
  args: dayArgs,
  handler: async (ctx, key) => {
    const { user } = await requireOrgMember(ctx, key.orgId)
    const history = await loadHistory(ctx, key)
    const start = history.find((d) => d.fixStock !== undefined)
    if (start?.date === key.date) throw new ConvexError('cannot_clear_start')
    await writeDay(ctx, key, history, user._id, (day) => ({
      ...day,
      fixStock: undefined,
      fixPmp: undefined,
    }))
    return null
  },
})
