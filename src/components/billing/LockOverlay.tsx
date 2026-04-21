import { useId, type ReactNode } from 'react'
import { Lock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useUpgradeDialog } from '@/context/UpgradeDialogContext'
import { PRICES } from '@/lib/billing'
import type { PaywallGate } from '@/lib/entitlement-limits'

/**
 * Per-gate screen-reader hint describing what the Pro unlock actually does.
 * The visible pill is short ("Unlock for €49"); a VoiceOver user would only
 * hear the label. The hidden description gives enough context to decide
 * whether to activate the paywall without visually scanning the card.
 */
const GATE_DESCRIPTION_KEY: Record<PaywallGate, string> = {
  invite: 'billing.gate.invite.subtitle',
  advanced_mortgage: 'billing.gate.advancedMortgage.subtitle',
  budget: 'billing.gate.budget.subtitle',
  export: 'billing.gate.export.subtitle',
  print: 'billing.gate.print.subtitle',
  what_if: 'billing.gate.whatIf.subtitle',
  storage: 'billing.gate.storage.subtitle',
  create_house: 'billing.gate.createHouse.subtitle',
  generic: 'billing.gate.generic.subtitle',
}

interface LockOverlayProps {
  gate: PaywallGate
  /** When `active`, renders the overlay on top of children and blurs them. Otherwise renders children untouched. */
  active: boolean
  children: ReactNode
  /** Optional custom label shown on the pill. Defaults to "Unlock for €49". */
  label?: string
  /** Compact variant — smaller pill, used on tight cards. */
  compact?: boolean
}

/**
 * Renders children behind a soft-lock overlay when `active` is true.
 * Clicking the pill opens the upgrade modal with the gate context.
 *
 * Chosen over a hard block because the research shows soft paywalls at feature
 * discovery moments convert 5–10x better than upfront walls — the user sees
 * what they'd get, then pays for it.
 */
export function LockOverlay({ gate, active, children, label, compact }: LockOverlayProps) {
  const { t } = useTranslation()
  const { open } = useUpgradeDialog()
  const descriptionId = useId()

  if (!active) return <>{children}</>

  const resolvedLabel = label ?? t('billing.unlockFor', { price: PRICES.pro.display })
  const description = t(GATE_DESCRIPTION_KEY[gate] ?? GATE_DESCRIPTION_KEY.generic)

  return (
    <div className="relative">
      {/*
        The blurred teaser must be FULLY inert to assistive tech AND to keyboard
        navigation — aria-hidden alone doesn't prevent tab-focus in Firefox/Safari.
        The `inert` attribute (widely supported since 2023) takes the whole subtree
        out of the tab order and the accessibility tree.
      */}
      <div
        aria-hidden
        // React 19 supports `inert` as a boolean prop. Cast keeps older TS lib happy.
        {...({ inert: true } as { inert?: boolean })}
        className="pointer-events-none select-none blur-[2px] opacity-60"
      >
        {children}
      </div>
      <button
        type="button"
        onClick={() => open(gate)}
        aria-label={resolvedLabel}
        aria-describedby={descriptionId}
        className={cn(
          'absolute inset-0 flex items-center justify-center cursor-pointer group',
          'bg-background/40 backdrop-blur-[1px] rounded-xl',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        )}
      >
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full bg-foreground text-background shadow-lg',
            'transition-transform group-hover:scale-105',
            compact ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm font-medium',
          )}
        >
          <Lock className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
          {resolvedLabel}
        </span>
        <span id={descriptionId} className="sr-only">
          {description}
        </span>
      </button>
    </div>
  )
}
