import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import { Sparkles, ArrowRight, Loader2, Clock } from 'lucide-react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { doc, onSnapshot, updateDoc } from 'firebase/firestore'
import { auth, db } from '@/data/firebase'
import { buttonVariants } from '@/components/ui/button'
import { track } from '@/lib/analytics'
import { reconcileOrder } from '@/lib/billing'
import type { PaywallGate } from '@/lib/entitlement-limits'

/**
 * Map a paywall gate to the in-app destination the user was trying to reach.
 * The happy-path fallback stays `/app?onboard=invite` because "invite your
 * partner" is the #1 reason most users pay — covers generic + unknown gates.
 */
const GATE_DESTINATIONS: Record<PaywallGate, string> = {
  invite: '/app?onboard=invite',
  advanced_mortgage: '/app/mortgage',
  what_if: '/app/mortgage',
  budget: '/app',
  export: '/app',
  print: '/app',
  storage: '/app/documents',
  create_house: '/app',
  generic: '/app?onboard=invite',
}

function destinationForGate(gate: string | null): string {
  if (gate && (gate as PaywallGate) in GATE_DESTINATIONS) {
    return GATE_DESTINATIONS[gate as PaywallGate]
  }
  return GATE_DESTINATIONS.generic
}

type Status = 'waiting' | 'confirmed' | 'pending'

const PENDING_TIMEOUT_MS = 3000

/**
 * Post-checkout landing. Polar redirects here after a successful payment.
 *
 * Two product flows converge here:
 *
 *   product=pro (and legacy / missing product)
 *     The webhook grants Pro to the user's active house. We watch that
 *     house's entitlement doc and flip to the celebration UI as soon as
 *     tier=pro is observed. If ~3s pass without confirmation we show a
 *     polite "finalising" state with a contact link so a silent webhook
 *     failure is visible rather than falsely claimed success.
 *
 *   product=additional_house
 *     The webhook provisions a brand-new house (name came from the
 *     checkout metadata). We can't rely on the user's active house —
 *     that's the paying house, which was already Pro. Instead we call
 *     `reconcileOrder({ mode: 'additional_house' })`, which returns the
 *     newly provisioned `houseId` (or creates it if the webhook hasn't
 *     fired yet, since it's idempotent with the webhook via the
 *     `polar_orders/{polarOrderId}` marker). Once we have the id we
 *     switch the user's active house and flip to confirmed — the
 *     existing destination routing lands them inside the new house.
 *
 * Public route — analytics event `upgrade_completed` is tracked once on
 * mount per CLAUDE.md rules (no Umami events inside /app/*).
 */
export function ThanksPage() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState<Status>('waiting')
  const destination = useMemo(
    () => destinationForGate(searchParams.get('gate')),
    [searchParams],
  )
  const product = searchParams.get('product')
  const isAdditionalHouse = product === 'additional_house'

  useEffect(() => {
    track('upgrade_completed')

    let cancelled = false
    let unsubProfile: (() => void) | null = null
    let unsubEntitlement: (() => void) | null = null
    let activeHouseId: string | null = null
    let confirmed = false

    // Pro product relies on an entitlement snapshot arriving via Firestore;
    // we use a short timeout to surface a graceful "finalising" state if the
    // webhook silently failed. additional_house has its own internal retry
    // loop (up to ~5.5s cumulative) and flips to pending when exhausted —
    // starting an external 3s timer there would cause a premature "pending"
    // flash while the retries are still in flight.
    const pendingTimer = isAdditionalHouse
      ? null
      : window.setTimeout(() => {
          if (!confirmed && !cancelled) setStatus('pending')
        }, PENDING_TIMEOUT_MS)

    const onConfirmed = () => {
      if (cancelled) return
      confirmed = true
      setStatus('confirmed')
      if (pendingTimer !== null) window.clearTimeout(pendingTimer)
    }

    // ── additional_house: resolve the new house via reconcileOrder ────
    //
    // Small retry loop: Polar's orders-list API is occasionally slower to
    // show a just-created paid order than the webhook is to deliver it, so
    // the first call could return no-order even on a successful payment.
    // Retries at ~0.5s, 1.5s, 3.5s are cheap and cover the common race.
    const runAdditionalHouseResolution = async (user: User) => {
      const delays = [0, 500, 1500, 3500]
      for (const delay of delays) {
        if (cancelled) return
        if (delay > 0) await new Promise((r) => setTimeout(r, delay))
        if (cancelled) return
        try {
          const res = await reconcileOrder({ mode: 'additional_house' })
          if (cancelled) return
          if (res.houseId && (res.status === 'reconciled' || res.status === 'already-pro')) {
            // Switch the user's active house so the in-app UI — which
            // reads users/{uid}.houseId via HouseholdContext — lands on
            // the newly provisioned house as soon as they hit the CTA.
            try {
              await updateDoc(doc(db, 'users', user.uid), { houseId: res.houseId })
            } catch {
              // Best-effort: if the profile write fails (offline, rules
              // drift), we still show 'confirmed' and the user can switch
              // to the new house via the HouseSwitcher.
            }
            onConfirmed()
            return
          }
          // status === 'no-order' — retry on the next tick.
        } catch {
          // Network / transient error — retry on the next tick.
        }
      }
      // All retries exhausted without a matching paid order.
      if (!cancelled && !confirmed) setStatus('pending')
    }

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      unsubProfile?.()
      unsubEntitlement?.()
      unsubProfile = null
      unsubEntitlement = null
      activeHouseId = null
      if (!user || cancelled) return

      if (isAdditionalHouse) {
        // Kick off the reconcile loop; no Firestore subscription needed.
        void runAdditionalHouseResolution(user)
        return
      }

      // ── pro product: existing entitlement-watch flow ───────────────
      unsubProfile = onSnapshot(
        doc(db, 'users', user.uid),
        (snap) => {
          const nextHouseId = (snap.data()?.houseId as string | undefined) ?? null
          if (nextHouseId === activeHouseId) return
          activeHouseId = nextHouseId
          unsubEntitlement?.()
          unsubEntitlement = null
          if (!nextHouseId) return

          unsubEntitlement = onSnapshot(
            doc(db, 'houses', nextHouseId, 'meta', 'entitlement'),
            (entSnap) => {
              if (entSnap.exists() && entSnap.data()?.tier === 'pro') {
                onConfirmed()
              }
            },
            () => {
              // Read error (e.g. stale auth) — leave timer to flip to pending.
            },
          )
        },
        () => {
          // Profile read error — timer will surface the pending state.
        },
      )
    })

    return () => {
      cancelled = true
      if (pendingTimer !== null) window.clearTimeout(pendingTimer)
      unsubAuth()
      unsubProfile?.()
      unsubEntitlement?.()
    }
  }, [isAdditionalHouse])

  return (
    <div className="min-h-dvh flex items-center justify-center p-6 bg-gradient-to-br from-background via-background to-primary/5">
      <div className="max-w-md w-full text-center space-y-6" aria-live="polite">
        {status === 'waiting' && <WaitingBody />}
        {status === 'confirmed' && <ConfirmedBody t={t} destination={destination} />}
        {status === 'pending' && <PendingBody t={t} destination={destination} />}
      </div>
    </div>
  )
}

function WaitingBody() {
  const { t } = useTranslation()
  return (
    <>
      <div className="inline-flex h-20 w-20 rounded-full bg-primary/10 items-center justify-center mx-auto">
        <Loader2 className="h-9 w-9 text-primary animate-spin" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t('billing.thanks.waitingTitle')}</h1>
        <p className="text-muted-foreground">{t('billing.thanks.waitingSubtitle')}</p>
      </div>
    </>
  )
}

function ConfirmedBody({
  t,
  destination,
}: {
  t: ReturnType<typeof useTranslation>['t']
  destination: string
}) {
  return (
    <>
      <div className="inline-flex h-20 w-20 rounded-full bg-primary/15 items-center justify-center mx-auto">
        <Sparkles className="h-9 w-9 text-primary" />
      </div>
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">{t('billing.thanks.title')}</h1>
        <p className="text-muted-foreground">{t('billing.thanks.subtitle')}</p>
      </div>
      <div className="rounded-xl border bg-card p-4 text-sm text-left space-y-2">
        <p className="font-medium">{t('billing.thanks.nextStepsTitle')}</p>
        <ul className="space-y-1 text-muted-foreground">
          <li>· {t('billing.thanks.step1')}</li>
          <li>· {t('billing.thanks.step2')}</li>
          <li>· {t('billing.thanks.step3')}</li>
        </ul>
      </div>
      <Link
        to={destination}
        className={buttonVariants({ size: 'lg' }) + ' w-full'}
      >
        {t('billing.thanks.cta')}
        <ArrowRight className="h-4 w-4 ml-1.5" />
      </Link>
    </>
  )
}

function PendingBody({
  t,
  destination,
}: {
  t: ReturnType<typeof useTranslation>['t']
  destination: string
}) {
  return (
    <>
      <div className="inline-flex h-20 w-20 rounded-full bg-amber-500/10 items-center justify-center mx-auto">
        <Clock className="h-9 w-9 text-amber-600" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t('billing.thanks.pendingTitle')}</h1>
        <p className="text-muted-foreground">{t('billing.thanks.pendingSubtitle')}</p>
      </div>
      <div className="flex flex-col gap-2">
        <Link
          to={destination}
          className={buttonVariants({ size: 'lg', variant: 'outline' }) + ' w-full'}
        >
          {t('billing.thanks.pendingCta')}
        </Link>
        <a
          href="mailto:david@nualsolutions.com?subject=CasaTab%20Pro%20purchase%20not%20unlocked"
          className="text-sm text-primary hover:underline"
        >
          {t('billing.thanks.pendingContact')}
        </a>
      </div>
    </>
  )
}
