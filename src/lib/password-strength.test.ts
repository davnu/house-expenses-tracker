import { describe, it, expect } from 'vitest'
import { scorePassword } from './password-strength'

describe('scorePassword', () => {
  it('scores empty as veryWeak', () => {
    expect(scorePassword('')).toEqual({ score: 0, labelKey: 'veryWeak' })
  })

  it('scores short single-class as veryWeak', () => {
    expect(scorePassword('abc').score).toBe(0)
  })

  it('scores 8+ chars single-class as weak', () => {
    expect(scorePassword('abcdefgh').score).toBe(1)
  })

  it('scores 8+ chars with two classes as fair', () => {
    expect(scorePassword('abcdefg1').score).toBe(2)
  })

  it('scores 8+ chars with three classes as strong', () => {
    expect(scorePassword('Abcdefg1').score).toBe(3)
  })

  it('scores 12+ chars with 3+ classes as veryStrong', () => {
    expect(scorePassword('Abcdefghij1!').score).toBe(4)
  })

  it('labelKey matches score', () => {
    expect(scorePassword('').labelKey).toBe('veryWeak')
    expect(scorePassword('abcdefgh').labelKey).toBe('weak')
    expect(scorePassword('abcdefg1').labelKey).toBe('fair')
    expect(scorePassword('Abcdefg1').labelKey).toBe('strong')
    expect(scorePassword('Abcdefghij1!').labelKey).toBe('veryStrong')
  })

  // ── Edge cases ─────────────────────────────────────────

  it('never exceeds max score of 4 even for absurdly complex passwords', () => {
    const r = scorePassword('Abcdefghijklmnop1234567890!@#$%^&*()')
    expect(r.score).toBe(4)
    expect(r.labelKey).toBe('veryStrong')
  })

  it('treats whitespace as valid non-letter characters', () => {
    // 8 chars, two classes (letters + space counts as "other")
    const r = scorePassword('abcdefg ')
    expect(r.score).toBeGreaterThanOrEqual(2)
  })

  it('handles unicode characters without crashing', () => {
    const r = scorePassword('pässwörd1')
    expect(typeof r.score).toBe('number')
    expect(r.score).toBeGreaterThanOrEqual(1)
  })

  it('handles emoji (counted as "other" class)', () => {
    const r = scorePassword('abcdefgh😀')
    expect(typeof r.score).toBe('number')
  })

  it('length-only boost for very long all-lowercase passwords', () => {
    // 20 chars, single class — gets 2 length points, 0 variety
    const r = scorePassword('abcdefghijklmnopqrst')
    expect(r.score).toBe(2)
  })

  it('a whitespace-only password scores as veryWeak when short', () => {
    expect(scorePassword('   ').score).toBe(0)
  })

  it('is deterministic — same input always produces same output', () => {
    const a = scorePassword('Abcdefg1')
    const b = scorePassword('Abcdefg1')
    expect(a).toEqual(b)
  })

  it('single-character classes at exactly boundary lengths', () => {
    expect(scorePassword('abcdefg').score).toBe(0) // 7 chars
    expect(scorePassword('abcdefgh').score).toBe(1) // 8 chars (threshold)
    expect(scorePassword('abcdefghijkl').score).toBe(2) // 12 chars (threshold)
  })
})
