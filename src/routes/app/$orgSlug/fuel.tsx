import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useConvexQuery } from '@convex-dev/react-query'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { z } from 'zod'

import { api } from '../../../../convex/_generated/api'
import { addDays, isIsoDate } from '../../../../convex/lib/fuel'
import type { Id } from '../../../../convex/_generated/dataModel'
import { getI18n } from '~/lib/i18n'
import { getLocale } from '~/lib/locale'
import { Button } from '~/components/ui/button'
import { Skeleton } from '~/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { FuelDayView } from '~/components/fuel/FuelDayView'
import { FuelMonthView } from '~/components/fuel/FuelMonthView'
import { localToday, useFormatters } from '~/components/fuel/format'
import { useFuelActions, useFuelData } from '~/components/fuel/useFuel'

const searchSchema = z.object({
  view: z.enum(['day', 'month']).optional().catch(undefined),
  date: z.string().refine(isIsoDate).optional().catch(undefined),
})

export const Route = createFileRoute('/app/$orgSlug/fuel')({
  component: FuelPage,
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: getI18n(getLocale()).getFixedT(null, 'fuel')('metaTitle') },
    ],
  }),
})

function FuelPage() {
  const { orgSlug } = Route.useParams()
  const org = useConvexQuery(api.organizations.bySlug, { slug: orgSlug })
  return org ? <FuelScreen orgId={org._id} /> : <FuelSkeleton />
}

function FuelSkeleton() {
  return (
    <main className="flex-1 space-y-4 p-6">
      <Skeleton className="h-9 w-72" />
      <Skeleton className="h-[480px] w-full rounded-xl" />
    </main>
  )
}

function FuelScreen({ orgId }: { orgId: Id<'organizations'> }) {
  const { t } = useTranslation('fuel')
  const fmt = useFormatters()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  // The station's calendar day, from the browser clock (not the server's UTC).
  const [today] = useState(localToday)

  const view = search.view ?? 'day'
  const date = search.date && search.date <= today ? search.date : today
  const month = date.slice(0, 7)
  const data = useFuelData(orgId, today)
  const actions = useFuelActions(orgId)

  const go = (next: { view?: 'day' | 'month'; date?: string }) =>
    void navigate({
      search: {
        view: next.view === 'month' ? 'month' : undefined,
        date:
          next.date === undefined || next.date === today
            ? undefined
            : next.date,
      },
    })

  const isCurrent =
    view === 'day' ? date === today : month === today.slice(0, 7)
  const shift = (n: -1 | 1) => {
    if (view === 'day') return go({ date: addDays(date, n) })
    const [y, m] = month.split('-').map(Number)
    const first = new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10)
    go({ view, date: first.slice(0, 7) === today.slice(0, 7) ? today : first })
  }

  return (
    <main className="flex-1 space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <h1 className="mr-auto text-2xl font-semibold tracking-tight">
          {t('title')}
        </h1>
        <Tabs
          value={view}
          onValueChange={(v) =>
            go({ view: v === 'month' ? 'month' : 'day', date })
          }
        >
          <TabsList aria-label={t('view.label')}>
            <TabsTrigger value="day">{t('view.day')}</TabsTrigger>
            <TabsTrigger value="month">{t('view.month')}</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            aria-label={t('nav.previous')}
            onClick={() => shift(-1)}
          >
            <ChevronLeft />
          </Button>
          <span className="min-w-44 text-center font-medium">
            {view === 'day' ? fmt.longDay(date) : fmt.month(month)}
          </span>
          <Button
            variant="outline"
            size="icon"
            aria-label={t('nav.next')}
            disabled={isCurrent}
            onClick={() => shift(1)}
          >
            <ChevronRight />
          </Button>
          {!isCurrent && (
            <Button variant="ghost" size="sm" onClick={() => go({ view })}>
              {t('nav.today')}
            </Button>
          )}
        </div>
      </div>

      {!data ? (
        <Skeleton className="h-[480px] w-full rounded-xl" />
      ) : view === 'day' ? (
        <FuelDayView
          date={date}
          today={today}
          data={data}
          actions={actions}
          onGoto={(d) => go({ date: d })}
        />
      ) : (
        <FuelMonthView month={month} data={data} />
      )}
    </main>
  )
}
