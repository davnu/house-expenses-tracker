import { useState, useRef, useEffect, useCallback } from 'react'
import { Home, ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SHARED_PAYER, SHARED_PAYER_COLOR, SHARED_PAYER_LABEL } from '@/lib/constants'
import type { HouseMember } from '@/types/expense'

interface PayerSelectProps {
  value: string
  onChange: (value: string) => void
  members: HouseMember[]
  id?: string
  'aria-invalid'?: boolean
}

export function PayerSelect({ value, onChange, members, id, ...props }: PayerSelectProps) {
  const [open, setOpen] = useState(false)
  const [focusIndex, setFocusIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  // Items: 1 shared + N members
  const itemCount = 1 + members.length

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

  // Close on outside pointer
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

  // Keyboard navigation
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

  // Focus active item
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

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
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
          {value === SHARED_PAYER ? (
            <>
              <Home className="h-4 w-4 shrink-0" style={{ color: SHARED_PAYER_COLOR }} aria-hidden="true" />
              <span>{SHARED_PAYER_LABEL}</span>
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
              <span className="text-muted-foreground">Former member</span>
            </>
          )}
        </span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div
          role="listbox"
          aria-label="Select who paid"
          className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border bg-card shadow-lg overflow-hidden"
        >
          {/* Shared option */}
          <div className="py-1">
            <button
              ref={(el) => { itemRefs.current[0] = el }}
              type="button"
              role="option"
              aria-selected={value === SHARED_PAYER}
              tabIndex={focusIndex === 0 ? 0 : -1}
              className={optionClass(value === SHARED_PAYER)}
              onClick={() => select(SHARED_PAYER)}
            >
              <Home className="h-4 w-4 shrink-0" style={{ color: SHARED_PAYER_COLOR }} aria-hidden="true" />
              <span className="flex-1 truncate">{SHARED_PAYER_LABEL}</span>
              {value === SHARED_PAYER && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
            </button>
          </div>

          {/* Separator */}
          <div className="border-t" />

          {/* Member options */}
          <div className="py-1">
            {members.map((m, i) => (
              <button
                key={m.uid}
                ref={(el) => { itemRefs.current[i + 1] = el }}
                type="button"
                role="option"
                aria-selected={value === m.uid}
                tabIndex={focusIndex === i + 1 ? 0 : -1}
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
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
