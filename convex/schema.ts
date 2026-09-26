import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'
import { moduleKeyValidator } from './lib/modules'

export const roleValidator = v.union(
  v.literal('owner'),
  v.literal('admin'),
  v.literal('member'),
)

export const invitationRoleValidator = v.union(
  v.literal('admin'),
  v.literal('member'),
)

// Must list the same ids as `FUEL_PRODUCTS` in `convex/lib/fuel.ts`.
export const fuelProductValidator = v.union(
  v.literal('sp98'),
  v.literal('e10'),
  v.literal('go'),
  v.literal('go_plus'),
  v.literal('e85'),
  v.literal('gpl'),
  v.literal('adblue'),
)

export default defineSchema({
  users: defineTable({
    betterAuthId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    avatarStorageId: v.optional(v.id('_storage')),
    superAdmin: v.boolean(),
    preferredLanguage: v.optional(v.union(v.literal('en'), v.literal('fr'))),
    createdAt: v.number(),
    // Deprecated: the per-user "last viewed org" now lives in `userPrefs`
    // (see below) to keep it off the hot `users` row. Kept here as an
    // optional legacy field so documents written before the move still
    // validate; never written anymore, only read as a fallback by
    // `getLastOrgSlug` until `userPrefs` is populated on next navigation.
    lastOrgSlug: v.optional(v.string()),
  })
    .index('by_betterAuthId', ['betterAuthId'])
    .index('by_email', ['email']),

  // Frequently-written per-user state, isolated from `users` on purpose:
  // every query reads the caller's `users` row (requireAppUser), so writes
  // there invalidate ALL open subscriptions. See KNOWN_ISSUES.md
  // § "Hot `users` row".
  userPrefs: defineTable({
    userId: v.id('users'),
    lastOrgSlug: v.optional(v.string()),
  }).index('by_user', ['userId']),

  organizations: defineTable({
    slug: v.string(),
    name: v.string(),
    logoUrl: v.optional(v.string()),
    logoStorageId: v.optional(v.id('_storage')),
    // Tools the super admin switched on for this org. Absent = none.
    enabledModules: v.optional(v.array(moduleKeyValidator)),
    createdBy: v.id('users'),
    createdAt: v.number(),
  }).index('by_slug', ['slug']),

  organizationMembers: defineTable({
    orgId: v.id('organizations'),
    userId: v.id('users'),
    role: roleValidator,
    joinedAt: v.number(),
  })
    .index('by_org', ['orgId'])
    .index('by_user', ['userId'])
    .index('by_org_and_user', ['orgId', 'userId']),

  invitations: defineTable({
    orgId: v.id('organizations'),
    email: v.string(),
    role: invitationRoleValidator,
    token: v.string(),
    invitedBy: v.id('users'),
    expiresAt: v.number(),
    acceptedAt: v.optional(v.number()),
  })
    .index('by_token', ['token'])
    .index('by_org', ['orgId'])
    .index('by_email_and_org', ['email', 'orgId']),

  items: defineTable({
    orgId: v.id('organizations'),
    title: v.string(),
    description: v.optional(v.string()),
    createdBy: v.id('users'),
    createdAt: v.number(),
  }).index('by_org', ['orgId']),

  // Fuel margin: one row per org × product × day, holding only what someone
  // typed. Stock, PMP and margins are derived by `convex/lib/fuel.ts` on
  // read — never stored, so a correction propagates. Units are in that file.
  fuelDays: defineTable({
    orgId: v.id('organizations'),
    product: fuelProductValidator,
    date: v.string(), // YYYY-MM-DD
    sold: v.optional(v.number()),
    price: v.optional(v.number()),
    deliveries: v.array(v.object({ liters: v.number(), price: v.number() })),
    fixStock: v.optional(v.number()),
    fixPmp: v.optional(v.number()),
    updatedBy: v.id('users'),
    updatedAt: v.number(),
  }).index('by_org_and_product_and_date', ['orgId', 'product', 'date']),
})
