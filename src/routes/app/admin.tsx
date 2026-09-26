import { useEffect } from 'react'
import {
  Link,
  createFileRoute,
  useNavigate,
} from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ConvexError } from 'convex/values'
import { useConvexMutation, useConvexQuery } from '@convex-dev/react-query'

import { api } from '../../../convex/_generated/api'
import { MODULE_KEYS } from '../../../convex/lib/modules'
import type { ModuleKey } from '../../../convex/lib/modules'
import type { Id } from '../../../convex/_generated/dataModel'
import { getI18n } from '~/lib/i18n'
import { getLocale } from '~/lib/locale'
import { Button } from '~/components/ui/button'
import { Checkbox } from '~/components/ui/checkbox'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/ui/card'

export const Route = createFileRoute('/app/admin')({
  component: AdminPage,
  head: () => ({
    meta: [
      {
        title: getI18n(getLocale()).getFixedT(null, 'nav')('admin.metaTitle'),
      },
    ],
  }),
})

function AdminPage() {
  const navigate = useNavigate()
  const { t } = useTranslation('nav')
  const me = useConvexQuery(api.users.me)
  const overview = useConvexQuery(
    api.admin.overview,
    me?.kind === 'ready' && me.user.superAdmin ? {} : 'skip',
  )
  const orgs = useConvexQuery(
    api.admin.listOrgs,
    me?.kind === 'ready' && me.user.superAdmin ? {} : 'skip',
  )
  const users = useConvexQuery(
    api.admin.listUsers,
    me?.kind === 'ready' && me.user.superAdmin ? {} : 'skip',
  )
  const setSuperAdmin = useConvexMutation(api.admin.setSuperAdmin)
  const setOrgModule = useConvexMutation(api.admin.setOrgModule)

  useEffect(() => {
    if (me?.kind === 'ready' && !me.user.superAdmin) {
      navigate({ to: '/app' })
    }
  }, [me, navigate])

  if (!me || me.kind !== 'ready') {
    return (
      <main className="flex min-h-svh items-center justify-center">
        <p className="text-muted-foreground text-sm">{t('loading')}</p>
      </main>
    )
  }

  if (!me.user.superAdmin) {
    return (
      <main className="flex min-h-svh items-center justify-center">
        <p className="text-muted-foreground text-sm">{t('redirecting')}</p>
      </main>
    )
  }

  async function handleToggle(userId: string, value: boolean) {
    try {
      await setSuperAdmin({ userId: userId as never, value })
      toast.success(value ? t('admin.granted') : t('admin.revoked'))
    } catch (err) {
      const code = err instanceof ConvexError ? (err.data as string) : ''
      toast.error(
        code === 'last_super_admin'
          ? t('admin.lastSuperAdmin')
          : t('admin.actionFailed'),
      )
    }
  }

  async function handleModuleToggle(
    orgId: Id<'organizations'>,
    module: ModuleKey,
    enabled: boolean,
  ) {
    try {
      await setOrgModule({ orgId, module, enabled })
      toast.success(
        t(enabled ? 'admin.orgs.moduleEnabled' : 'admin.orgs.moduleDisabled', {
          module: t(`modules.${module}.name`),
        }),
      )
    } catch {
      toast.error(t('admin.actionFailed'))
    }
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t('admin.title')}
          </h1>
          <p className="text-muted-foreground text-sm">{t('admin.subtitle')}</p>
        </div>
        <Button asChild variant="outline">
          <Link to="/app">{t('admin.back')}</Link>
        </Button>
      </header>

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label={t('admin.stats.users')} value={overview?.userCount} />
        <Stat
          label={t('admin.stats.organizations')}
          value={overview?.orgCount}
        />
        <Stat
          label={t('admin.stats.memberships')}
          value={overview?.memberCount}
        />
        <Stat
          label={t('admin.stats.pendingInvites')}
          value={overview?.pendingInvitations}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1.5">
            <CardTitle>{t('admin.orgs.title')}</CardTitle>
            <CardDescription>{t('admin.orgs.description')}</CardDescription>
          </div>
          <Button asChild size="sm">
            <Link to="/app/onboarding">{t('admin.orgs.create')}</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {!orgs ? (
            <p className="text-muted-foreground text-sm">{t('loading')}</p>
          ) : orgs.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {t('admin.orgs.empty')}
            </p>
          ) : (
            <ul className="divide-border divide-y text-sm">
              {orgs.map((o) => (
                <li key={o._id} className="space-y-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{o.name}</p>
                      <p className="text-muted-foreground truncate text-xs">
                        /{o.slug} ·{' '}
                        {t('admin.orgs.members', { count: o.memberCount })}
                      </p>
                    </div>
                    <span className="text-muted-foreground text-xs">
                      {new Date(o.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {MODULE_KEYS.map((key) => {
                      const id = `module-${o._id}-${key}`
                      return (
                        <label
                          key={key}
                          htmlFor={id}
                          className="border-border hover:bg-muted/50 flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-xs"
                        >
                          <Checkbox
                            id={id}
                            checked={o.enabledModules.includes(key)}
                            onCheckedChange={(checked) =>
                              handleModuleToggle(o._id, key, checked === true)
                            }
                          />
                          {t(`modules.${key}.name`)}
                        </label>
                      )
                    })}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('admin.users.title')}</CardTitle>
          <CardDescription>{t('admin.users.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {!users ? (
            <p className="text-muted-foreground text-sm">{t('loading')}</p>
          ) : users.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {t('admin.users.empty')}
            </p>
          ) : (
            <ul className="divide-border divide-y text-sm">
              {users.map((u) => {
                const isSelf = u._id === me.user._id
                return (
                  <li
                    key={u._id}
                    className="flex items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {u.name ?? u.email}
                        {isSelf && (
                          <span className="text-muted-foreground ml-2 text-xs">
                            {t('admin.users.you')}
                          </span>
                        )}
                      </p>
                      <p className="text-muted-foreground truncate text-xs">
                        {u.email} ·{' '}
                        {t('admin.users.orgs', { count: u.orgCount })}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant={u.superAdmin ? 'default' : 'outline'}
                      onClick={() => handleToggle(u._id, !u.superAdmin)}
                    >
                      {u.superAdmin
                        ? t('admin.users.isSuperAdmin')
                        : t('admin.users.makeSuperAdmin')}
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  )
}

function Stat({ label, value }: { label: string; value: number | undefined }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="text-2xl font-semibold tabular-nums">{value ?? '—'}</p>
      </CardContent>
    </Card>
  )
}
