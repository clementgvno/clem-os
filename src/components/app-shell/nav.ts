import {
  Fuel,
  LayoutDashboard,
  Mail,
  Package,
  Settings,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ModuleKey } from '../../../convex/lib/modules'

export type NavLeaf = {
  /** i18n key under the `nav` namespace, e.g. `items.dashboard`. */
  titleKey: string
  to: string
  icon?: LucideIcon
  adminOnly?: boolean
  /** Hidden unless the super admin enabled this tool on the current org. */
  module?: ModuleKey
}

export type NavGroup = {
  /** i18n key under the `nav` namespace, e.g. `groups.platform`. */
  labelKey: string
  items: Array<NavLeaf>
  secondary?: boolean
}

export function getNavGroups(): Array<NavGroup> {
  return [
    {
      labelKey: 'groups.platform',
      items: [
        {
          titleKey: 'items.dashboard',
          to: '/app/$orgSlug',
          icon: LayoutDashboard,
        },
        {
          titleKey: 'items.fuel',
          to: '/app/$orgSlug/fuel',
          icon: Fuel,
          module: 'fuel',
        },
        {
          titleKey: 'items.items',
          to: '/app/$orgSlug/items',
          icon: Package,
          module: 'items',
        },
      ],
    },
    {
      labelKey: 'groups.workspace',
      secondary: true,
      items: [
        {
          titleKey: 'items.members',
          to: '/app/$orgSlug/settings/members',
          icon: Users,
          adminOnly: true,
        },
        {
          titleKey: 'items.invitations',
          to: '/app/$orgSlug/settings/invitations',
          icon: Mail,
          adminOnly: true,
        },
        {
          titleKey: 'items.settings',
          to: '/app/$orgSlug/settings',
          icon: Settings,
        },
      ],
    },
  ]
}
