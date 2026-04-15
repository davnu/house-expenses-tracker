import { describe, it, expect } from 'vitest'
import { getBudgetStatus, getBudgetStatusColor } from './budget-utils'

describe('getBudgetStatus', () => {
  it('returns on_track when under 80%', () => {
    expect(getBudgetStatus(7000, 10000)).toBe('on_track')
    expect(getBudgetStatus(0, 10000)).toBe('on_track')
    expect(getBudgetStatus(1, 10000)).toBe('on_track')
  })

  it('returns warning at exactly 80%', () => {
    expect(getBudgetStatus(8000, 10000)).toBe('warning')
  })

  it('returns warning between 80% and 100%', () => {
    expect(getBudgetStatus(9000, 10000)).toBe('warning')
    expect(getBudgetStatus(9999, 10000)).toBe('warning')
  })

  it('returns over at exactly 100%', () => {
    expect(getBudgetStatus(10000, 10000)).toBe('over')
  })

  it('returns over when above 100%', () => {
    expect(getBudgetStatus(15000, 10000)).toBe('over')
  })

  it('returns on_track when budget is zero', () => {
    expect(getBudgetStatus(5000, 0)).toBe('on_track')
  })

  it('returns on_track when budget is negative', () => {
    expect(getBudgetStatus(5000, -100)).toBe('on_track')
  })

  it('returns on_track when spent is zero', () => {
    expect(getBudgetStatus(0, 10000)).toBe('on_track')
  })
})

describe('getBudgetStatusColor', () => {
  it('returns red for over', () => {
    expect(getBudgetStatusColor('over')).toBe('#dc2626')
  })

  it('returns amber for warning', () => {
    expect(getBudgetStatusColor('warning')).toBe('#f59e0b')
  })

  it('returns teal for on_track', () => {
    expect(getBudgetStatusColor('on_track')).toBe('#2a9d90')
  })
})
