import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { parseDecimal } from '../../../convex/lib/fuel'
import { Input } from '~/components/ui/input'
import { cn } from '~/lib/utils'

/**
 * Numeric field that commits on blur or Enter, never on each keystroke.
 * Parses exactly (no floats) into an integer with `decimals` implied decimals,
 * shows the typed text while saving, and keeps it with an error message when
 * it is rejected. Escape restores the saved value.
 */
export function NumberField({
  id,
  value,
  unit,
  decimals,
  label,
  placeholder,
  validate,
  onCommit,
  tone = 'default',
  className,
}: {
  id: string
  /** Saved value, already formatted for an input ('' when empty). */
  value: string
  unit: string
  decimals: number
  label: string
  placeholder?: string
  /** Returns an error message, or null when the value is acceptable. */
  validate?: (v: number) => string | null
  /** Resolves once saved; rejects (after its own toast) to keep the draft. */
  onCommit: (v: number | null) => Promise<unknown>
  /** `carried`: value inherited from an earlier day. `missing`: expected, not typed. */
  tone?: 'default' | 'carried' | 'missing'
  className?: string
}) {
  const { t } = useTranslation('fuel')
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function commit() {
    if (draft === null || saving) return
    if (draft.trim() === value.trim()) {
      setDraft(null)
      setError(null)
      return
    }
    const parsed = parseDecimal(draft, decimals)
    let next: number | null
    if (parsed.kind === 'empty') next = null
    else if (parsed.kind === 'ok') next = parsed.value
    else {
      setError(
        parsed.kind === 'invalid'
          ? t('validation.invalid')
          : decimals === 0
            ? t('validation.integer')
            : t('validation.decimals', { count: decimals }),
      )
      return
    }
    const invalid = next === null ? null : (validate?.(next) ?? null)
    if (invalid) {
      setError(invalid)
      return
    }
    setSaving(true)
    try {
      await onCommit(next)
      setDraft(null)
      setError(null)
    } catch {
      // The caller already toasted; keep the draft so nothing typed is lost.
    } finally {
      setSaving(false)
    }
  }

  const errorId = `${id}-error`
  return (
    <div className={className}>
      <div className="relative">
        <Input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          aria-label={label}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          placeholder={placeholder}
          value={draft ?? value}
          onFocus={(e) => {
            // Keep a rejected draft so the person can fix what they typed.
            setDraft((d) => d ?? value)
            e.currentTarget.select()
          }}
          onChange={(e) => {
            setDraft(e.target.value)
            setError(null)
          }}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void commit()
            if (e.key === 'Escape') {
              setDraft(null)
              setError(null)
              e.currentTarget.blur()
            }
          }}
          className={cn(
            'pr-8 text-right tabular-nums',
            tone === 'carried' && 'text-muted-foreground border-dashed',
            tone === 'missing' && 'bg-warning-muted border-transparent',
          )}
        />
        <span className="text-muted-foreground pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs">
          {unit}
        </span>
      </div>
      {error && (
        <p id={errorId} className="text-destructive mt-1 text-xs">
          {error}
        </p>
      )}
    </div>
  )
}
