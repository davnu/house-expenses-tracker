import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ChevronDown, Plus, Check, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useHousehold } from '@/context/HouseholdContext'
import { useCanCreateHouse } from '@/hooks/use-can-create-house'
import { useUpgradeDialog } from '@/context/UpgradeDialogContext'
import { CreateHouseDialog } from './CreateHouseDialog'

export function HouseSwitcher() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { house, houses, switchHouse } = useHousehold()
  const { reason: createHouseReason } = useCanCreateHouse()
  const { open: openUpgrade } = useUpgradeDialog()
  const [open, setOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [switching, setSwitching] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [focusIndex, setFocusIndex] = useState(-1)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  const multiHouse = houses.length > 1

  // Total items = houses + 1 (create button)
  const itemCount = houses.length + 1

  // Close and restore focus
  const close = useCallback(() => {
    setOpen(false)
    setFocusIndex(-1)
    triggerRef.current?.focus()
  }, [])

  // Close on outside pointer (works for both mouse and touch)
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

  // Focus active item when focusIndex changes
  useEffect(() => {
    if (focusIndex >= 0) {
      itemRefs.current[focusIndex]?.focus()
    }
  }, [focusIndex])

  const handleSwitch = async (houseId: string) => {
    if (houseId === house?.id) {
      close()
      return
    }
    setSwitching(true)
    try {
      await switchHouse(houseId)
      close()
      navigate('/app', { replace: true })
    } catch {
      // Switch failed — stay on current house
      close()
    } finally {
      setSwitching(false)
    }
  }

  const handleOpen = () => {
    setOpen(!open)
    if (!open) setFocusIndex(0)
  }

  // Single house — static label, no dropdown
  if (!multiHouse) {
    return (
      <div className="px-3 py-4">
        <h1 className="text-lg font-bold truncate">{house?.name ?? t('common.houseExpenses')}</h1>
      </div>
    )
  }

  // Multiple houses — dropdown switcher
  return (
    <div ref={containerRef} className="relative px-3 py-4">
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`Current house: ${house?.name ?? t('common.houseExpenses')}. Switch house`}
        className="flex items-center gap-1.5 text-lg font-bold w-full text-left cursor-pointer hover:text-primary transition-colors"
        onClick={handleOpen}
      >
        <span className="truncate">{house?.name ?? t('common.houseExpenses')}</span>
        <ChevronDown className={cn(
          'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
          open && 'rotate-180',
          switching && 'animate-pulse'
        )} />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Select a house"
          className="absolute left-2 right-2 top-full z-50 mt-1 rounded-lg border bg-card shadow-lg overflow-hidden"
        >
          <div className="py-1">
            {houses.map((h, i) => (
              <button
                key={h.id}
                ref={(el) => { itemRefs.current[i] = el }}
                type="button"
                role="option"
                aria-selected={h.id === house?.id}
                tabIndex={focusIndex === i ? 0 : -1}
                className={cn(
                  'flex items-center gap-2 w-full px-3 py-2 text-sm text-left transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset',
                  h.id === house?.id
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'hover:bg-accent text-foreground'
                )}
                onClick={() => handleSwitch(h.id)}
              >
                <span className="truncate flex-1">{h.name}</span>
                {h.id === house?.id && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
              </button>
            ))}
          </div>
          <div className="border-t py-1">
            <button
              ref={(el) => { itemRefs.current[houses.length] = el }}
              type="button"
              role="option"
              aria-selected={false}
              tabIndex={focusIndex === houses.length ? 0 : -1}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
              disabled={createHouseReason === 'loading'}
              onClick={() => {
                close()
                // Mirror of SettingsPage: 'first' is the only free path.
                // 'hasProHouse' routes to the €29 additional_house paywall
                // which collects the new house's name and lets the webhook
                // provision it server-side. 'needsUpgrade' routes to the €49
                // Pro upgrade of the current house; creating more houses is
                // unlocked after that.
                if (createHouseReason === 'first') {
                  setCreateOpen(true)
                  return
                }
                if (createHouseReason === 'hasProHouse') {
                  openUpgrade('create_house', { product: 'additional_house' })
                  return
                }
                openUpgrade('create_house', { product: 'pro' })
              }}
            >
              {createHouseReason === 'first' || createHouseReason === 'hasProHouse' ? (
                <Plus className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Lock className="h-4 w-4" aria-hidden="true" />
              )}
              <span>{t('settings.createNewHouse')}</span>
            </button>
          </div>
        </div>
      )}

      <CreateHouseDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}
