import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Home, Users, ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  SHARED_PAYER,
  SHARED_PAYER_COLOR,
  SPLIT_PAYER,
  SPLIT_PAYER_COLOR,
  getSharedPayerLabel,
  getSplitPayerLabel,
} from '@/lib/constants'
import type { HouseMember } from '@/types/expense'

interface PayerSelectProps {
  value: string
  onChange: (value: string) => void
  members: HouseMember[]
  id?: string
  'aria-invalid'?: boolean
}

export function PayerSelect({ value, onChange, members, id, ...props }: PayerSelectProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [focusIndex, setFocusIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  // Pool options (Shared, Split) come first; then members. Order is stable.
  const poolOptions = useMemo(
    () => [
      { kind: 'shared' as const, value: SHARED_PAYER, label: getSharedPayerLabel(), color: SHARED_PAYER_COLOR, Icon: Home },
      { kind: 'split' as const, value: SPLIT_PAYER, label: getSplitPayerLabel(), color: SPLIT_PAYER_COLOR, Icon: Users },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t],
  )

  const itemCount = poolOptions.length + members.length

  const selectedMember = members.find((m) => m.uid === value)

  const close = useCallback(() => {
    setOpen(false)
    setFocusIndex(-1)
    triggerRef.current?.focus()
  }, [])

  const select = useCallback((val: string) => {
    onChange(val)
    close()
  }, [onChange, close])

  useEffect(() => {
    if (!open) return
    const handlePointer = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close()
      }
    }
    document.addEventListener('pointerdown', handlePointer)
    return () => document.removeEventListener('pointerdown', handlePointer)
  }, [open, close])

  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          e.preventDefault()
          close()
          break
        case 'ArrowDown':
          e.preventDefault()
          setFocusIndex((i) => (i + 1) % itemCount)
          break
        case 'ArrowUp':
          e.preventDefault()
          setFocusIndex((i) => (i - 1 + itemCount) % itemCount)
          break
        case 'Home':
          e.preventDefault()
          setFocusIndex(0)
          break
        case 'End':
          e.preventDefault()
          setFocusIndex(itemCount - 1)
          break
        case 'Tab':
          close()
          break
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, close, itemCount])

  useEffect(() => {
    if (focusIndex >= 0) {
      itemRefs.current[focusIndex]?.focus()
    }
  }, [focusIndex])

  const handleOpen = () => {
    setOpen(!open)
    if (!open) setFocusIndex(0)
  }

  const handleTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault()
      setOpen(true)
      setFocusIndex(0)
    }
  }

  const optionClass = (isSelected: boolean) =>
    cn(
      'flex items-center gap-2 w-full px-3 py-2 text-sm text-left transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset',
      isSelected
        ? 'bg-primary/10 text-primary font-medium'
        : 'hover:bg-accent text-foreground'
    )

  const selectedPool = poolOptions.find((o) => o.value === value)

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-invalid={props['aria-invalid']}
        className="flex h-10 sm:h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-base sm:text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
        onClick={handleOpen}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="flex items-center gap-2 truncate">
          {selectedPool ? (
            <>
              <selectedPool.Icon className="h-4 w-4 shrink-0" style={{ color: selectedPool.color }} aria-hidden="true" />
              <span>{selectedPool.label}</span>
            </>
          ) : selectedMember ? (
            <>
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: selectedMember.color }}
                aria-hidden="true"
              />
              <span>{selectedMember.displayName}</span>
            </>
          ) : (
            <>
              <span className="h-2.5 w-2.5 rounded-full shrink-0 bg-muted-foreground/50" aria-hidden="true" />
              <span className="text-muted-foreground">{t('common.formerMember')}</span>
            </>
          )}
        </span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={t('expenses.selectWhoPaid')}
          className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border bg-card shadow-lg overflow-hidden"
        >
          {/* Pool options: Shared + Split payment */}
          <div className="py-1">
            {poolOptions.map((opt, i) => (
              <button
                key={opt.value}
                ref={(el) => { itemRefs.current[i] = el }}
                type="button"
                role="option"
                aria-selected={value === opt.value}
                tabIndex={focusIndex === i ? 0 : -1}
                className={optionClass(value === opt.value)}
                onClick={() => select(opt.value)}
              >
                <opt.Icon className="h-4 w-4 shrink-0" style={{ color: opt.color }} aria-hidden="true" />
                <span className="flex-1 truncate">{opt.label}</span>
                {value === opt.value && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
              </button>
            ))}
          </div>

          <div className="border-t" />

          <div className="py-1">
            {members.map((m, i) => {
              const index = poolOptions.length + i
              return (
                <button
                  key={m.uid}
                  ref={(el) => { itemRefs.current[index] = el }}
                  type="button"
                  role="option"
                  aria-selected={value === m.uid}
                  tabIndex={focusIndex === index ? 0 : -1}
                  className={optionClass(value === m.uid)}
                  onClick={() => select(m.uid)}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: m.color }}
                    aria-hidden="true"
                  />
                  <span className="flex-1 truncate">{m.displayName}</span>
                  {value === m.uid && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
