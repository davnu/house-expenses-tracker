import { describe, it, expect } from 'vitest'
import {
  FREE_LIMITS,
  PRO_LIMITS,
  limitsForTier,
  resolveLimits,
  PaywallRequired,
} from './entitlement-limits'

describe('entitlement-limits', () => {
  describe('FREE_LIMITS', () => {
    it('gates collaboration, advanced mortgage, budget, export, print', () => {
      expect(FREE_LIMITS.hasHouseholdInvites).toBe(false)
      expect(FREE_LIMITS.hasAdvancedMortgage).toBe(false)
      expect(FREE_LIMITS.hasBudget).toBe(false)
      expect(FREE_LIMITS.hasExport).toBe(false)
      expect(FREE_LIMITS.hasPrintSummary).toBe(false)
      expect(FREE_LIMITS.hasMortgageWhatIf).toBe(false)
    })

    it('allows solo use with a meaningful storage quota', () => {
      expect(FREE_LIMITS.maxMembers).toBe(1)
      expect(FREE_LIMITS.maxStorageMB).toBe(50)
    })
  })

  describe('PRO_LIMITS', () => {
    it('unlocks every feature flag', () => {
      expect(PRO_LIMITS.hasHouseholdInvites).toBe(true)
      expect(PRO_LIMITS.hasAdvancedMortgage).toBe(true)
      expect(PRO_LIMITS.hasBudget).toBe(true)
      expect(PRO_LIMITS.hasExport).toBe(true)
      expect(PRO_LIMITS.hasPrintSummary).toBe(true)
      expect(PRO_LIMITS.hasMortgageWhatIf).toBe(true)
    })

    it('allows unlimited members and a 10x storage bump', () => {
      expect(PRO_LIMITS.maxMembers).toBe(Number.POSITIVE_INFINITY)
      expect(PRO_LIMITS.maxStorageMB).toBe(500)
    })
  })

  describe('limitsForTier', () => {
    it('returns FREE_LIMITS for free tier', () => {
      expect(limitsForTier('free')).toEqual(FREE_LIMITS)
    })
    it('returns PRO_LIMITS for pro tier', () => {
      expect(limitsForTier('pro')).toEqual(PRO_LIMITS)
    })
  })

  describe('resolveLimits', () => {
    it('defaults to free when entitlement is null or undefined', () => {
      expect(resolveLimits(null)).toEqual(FREE_LIMITS)
      expect(resolveLimits(undefined)).toEqual(FREE_LIMITS)
    })

    it('returns pro limits for pro entitlement', () => {
      expect(resolveLimits({ tier: 'pro' })).toEqual(PRO_LIMITS)
    })

    it('treats grandfathered pro as full pro', () => {
      const result = resolveLimits({ tier: 'pro', grandfathered: true })
      expect(result).toEqual(PRO_LIMITS)
    })
  })

  describe('PaywallRequired', () => {
    it('carries the gate identifier for analytics and UI copy', () => {
      const err = new PaywallRequired('invite')
      expect(err.gate).toBe('invite')
      expect(err.name).toBe('PaywallRequired')
      expect(err).toBeInstanceOf(Error)
    })

    it('has a sensible default message when none provided', () => {
      const err = new PaywallRequired('advanced_mortgage')
      expect(err.message).toContain('advanced_mortgage')
    })

    it('preserves a custom message when provided', () => {
      const err = new PaywallRequired('invite', 'Pro needed to invite partners')
      expect(err.message).toBe('Pro needed to invite partners')
    })
  })
})
