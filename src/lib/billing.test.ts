import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Mocks ──
//
// `startCheckout` is a thin wrapper around a Firebase callable. We mock the
// SDK so the tests can assert the error-translation behaviour (the real value
// this helper provides: converting Firebase error codes into a uniform
// `CheckoutNotConfigured` for the UI).

const { httpsCallableMock, callMock } = vi.hoisted(() => ({
  httpsCallableMock: vi.fn(),
  callMock: vi.fn(),
}))

vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(),
  httpsCallable: (...args: unknown[]) => {
    httpsCallableMock(...args)
    return callMock
  },
}))

vi.mock('@/data/firebase', () => ({ app: {}, db: {} }))

import { startCheckout, CheckoutNotConfigured, PRICES, reconcileOrder } from './billing'

// jsdom provides window.location but it's read-only by default. Override.
const originalLocation = window.location
beforeEach(() => {
  callMock.mockReset()
  httpsCallableMock.mockClear()
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { href: 'http://localhost/' },
  })
})
afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
})

describe('CheckoutNotConfigured', () => {
  it('is an Error subclass with a recognisable name', () => {
    const err = new CheckoutNotConfigured()
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('CheckoutNotConfigured')
  })

  it('carries a human-readable message', () => {
    expect(new CheckoutNotConfigured().message).toMatch(/not yet configured/i)
  })
})

describe('PRICES', () => {
  it('exposes €49 first-house + €29 additional (no fake anchor)', () => {
    expect(PRICES.pro.display).toBe('€49')
    expect(PRICES.additional_house.display).toBe('€29')
    // Regression guard: the fake €79 "anchor" was removed as a legal risk
    // (EU consumer law requires reference prices to reflect actual prior prices).
    expect('pro_anchor' in PRICES).toBe(false)
    // Regression guard: the €9 extra-storage add-on was removed — Pro's
    // 500 MB quota was deemed sufficient without an upsell path.
    expect('extra_storage' in PRICES).toBe(false)
  })

  it('stores cent-accurate amounts matching the display', () => {
    expect(PRICES.pro.amount).toBe(4900)
    expect(PRICES.additional_house.amount).toBe(2900)
  })
})

describe('startCheckout — success path', () => {
  it('redirects the window to the Polar-hosted checkout URL on success', async () => {
    callMock.mockResolvedValueOnce({ data: { url: 'https://polar.example/checkout/abc' } })
    await startCheckout('h1', 'pro', 'invite')
    expect(window.location.href).toBe('https://polar.example/checkout/abc')
  })

  it('forwards (houseId, product, gate) to the callable so Polar metadata carries the originating gate', async () => {
    callMock.mockResolvedValueOnce({ data: { url: 'https://x/y' } })
    await startCheckout('h1', 'additional_house', 'budget')
    expect(callMock).toHaveBeenCalledWith({
      houseId: 'h1',
      product: 'additional_house',
      gate: 'budget',
      newHouseName: undefined,
    })
  })

  it('forwards newHouseName via options for additional_house checkouts', async () => {
    callMock.mockResolvedValueOnce({ data: { url: 'https://x/y' } })
    await startCheckout('h1', 'additional_house', 'create_house', {
      newHouseName: 'Second home',
    })
    expect(callMock).toHaveBeenCalledWith({
      houseId: 'h1',
      product: 'additional_house',
      gate: 'create_house',
      newHouseName: 'Second home',
    })
  })
})

describe('startCheckout — error translation', () => {
  it('translates functions/not-found to CheckoutNotConfigured (function not deployed)', async () => {
    const err = Object.assign(new Error('not found'), { code: 'functions/not-found' })
    callMock.mockRejectedValueOnce(err)
    await expect(startCheckout('h1', 'pro')).rejects.toBeInstanceOf(CheckoutNotConfigured)
  })

  it('translates functions/unavailable to CheckoutNotConfigured (function unavailable)', async () => {
    const err = Object.assign(new Error('down'), { code: 'functions/unavailable' })
    callMock.mockRejectedValueOnce(err)
    await expect(startCheckout('h1', 'pro')).rejects.toBeInstanceOf(CheckoutNotConfigured)
  })

  it('translates functions/failed-precondition to a friendly transient error (not raw Firebase text)', async () => {
    const err = Object.assign(new Error('precondition'), {
      code: 'functions/failed-precondition',
    })
    callMock.mockRejectedValueOnce(err)
    const caught = await startCheckout('h1', 'pro').catch((e: Error) => e)
    expect(caught).toBeInstanceOf(Error)
    expect(caught).not.toBeInstanceOf(CheckoutNotConfigured)
    expect((caught as Error).message).not.toMatch(/precondition/i)
    expect((caught as Error).message).toMatch(/try again/i)
  })

  it('translates functions/internal to a friendly transient error', async () => {
    const err = Object.assign(new Error('boom'), { code: 'functions/internal' })
    callMock.mockRejectedValueOnce(err)
    const caught = await startCheckout('h1', 'pro').catch((e: Error) => e)
    expect(caught).toBeInstanceOf(Error)
    expect(caught).not.toBeInstanceOf(CheckoutNotConfigured)
    expect((caught as Error).message).not.toMatch(/boom/i)
    expect((caught as Error).message).toMatch(/try again/i)
  })

  it('propagates CheckoutNotConfigured thrown directly from the callable', async () => {
    callMock.mockRejectedValueOnce(new CheckoutNotConfigured())
    await expect(startCheckout('h1', 'pro')).rejects.toBeInstanceOf(CheckoutNotConfigured)
  })

  it('maps functions/unauthenticated to a friendly sign-out/in message (never raw "unauthenticated")', async () => {
    const err = Object.assign(new Error('Unauthenticated'), { code: 'functions/unauthenticated' })
    callMock.mockRejectedValueOnce(err)
    const caught = await startCheckout('h1', 'pro').catch((e: Error) => e)
    expect(caught).toBeInstanceOf(Error)
    expect(caught).not.toBeInstanceOf(CheckoutNotConfigured)
    expect((caught as Error).message).not.toMatch(/^Unauthenticated$/i)
    expect((caught as Error).message).toMatch(/sign out/i)
  })

  it('maps unknown/network errors to a generic friendly message (no raw SDK text)', async () => {
    callMock.mockRejectedValueOnce(new Error('Network request failed'))
    const caught = await startCheckout('h1', 'pro').catch((e: Error) => e)
    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).not.toMatch(/network request failed/i)
    expect((caught as Error).message.length).toBeGreaterThan(10)
  })

  it('treats a missing url in the response as not-configured (silent backend bug)', async () => {
    callMock.mockResolvedValueOnce({ data: {} })
    await expect(startCheckout('h1', 'pro')).rejects.toBeInstanceOf(CheckoutNotConfigured)
  })
})

describe('reconcileOrder', () => {
  it('preserves the legacy string-houseId signature as mode="pro"', async () => {
    callMock.mockResolvedValueOnce({ data: { status: 'reconciled', houseId: 'h1' } })
    const res = await reconcileOrder('h1')
    // The server is expected to default mode='pro' when callers pass a plain
    // houseId. If this assertion changes, BillingSection's "I paid but don't
    // see Pro" button also needs audit.
    expect(callMock).toHaveBeenCalledWith({ mode: 'pro', houseId: 'h1' })
    expect(res).toEqual({ status: 'reconciled', houseId: 'h1' })
  })

  it('supports mode="additional_house" without a houseId (ThanksPage flow)', async () => {
    callMock.mockResolvedValueOnce({
      data: { status: 'reconciled', houseId: 'h_new', polarOrderId: 'ord_1' },
    })
    const res = await reconcileOrder({ mode: 'additional_house' })
    expect(callMock).toHaveBeenCalledWith({
      mode: 'additional_house',
      houseId: undefined,
    })
    expect(res.houseId).toBe('h_new')
  })
})
