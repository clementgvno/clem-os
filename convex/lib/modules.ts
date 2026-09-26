import { ConvexError, v } from 'convex/values'
import type { GenericMutationCtx, GenericQueryCtx } from 'convex/server'
import type { DataModel, Id } from '../_generated/dataModel'

/**
 * Registry of the tools ("modules") a super admin can switch on per org.
 * Single source of truth, imported by the schema, the backend guards and the
 * sidebar. Adding a tool = one key here + its page + its i18n entries
 * (`nav:modules.<key>.name` / `.description`).
 */
export const MODULE_KEYS = ['items', 'fuel'] as const

export type ModuleKey = (typeof MODULE_KEYS)[number]

export const moduleKeyValidator = v.union(
  ...MODULE_KEYS.map((key) => v.literal(key)),
)

type Ctx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>

/** Throws `module_disabled` unless the super admin enabled `key` on `orgId`. */
export async function requireOrgModule(
  ctx: Ctx,
  orgId: Id<'organizations'>,
  key: ModuleKey,
): Promise<void> {
  const org = await ctx.db.get('organizations', orgId)
  if (!org) throw new ConvexError('not_found')
  if (!(org.enabledModules ?? []).includes(key)) {
    throw new ConvexError('module_disabled')
  }
}
