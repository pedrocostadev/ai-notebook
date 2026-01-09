import { describe, it, expect } from 'vitest'
import { estimateTokens } from './token-counter'

describe('estimateTokens', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0)
  })

  it('estimates ~4 chars per token', () => {
    expect(estimateTokens('test')).toBe(1) // 4 chars = 1 token
    expect(estimateTokens('testing1')).toBe(2) // 8 chars = 2 tokens
    expect(estimateTokens('12345678901234567890')).toBe(5) // 20 chars = 5 tokens
  })

  it('rounds up partial tokens', () => {
    expect(estimateTokens('ab')).toBe(1) // 2 chars = ceil(0.5) = 1
    expect(estimateTokens('abc')).toBe(1) // 3 chars = ceil(0.75) = 1
    expect(estimateTokens('abcde')).toBe(2) // 5 chars = ceil(1.25) = 2
  })

  it('handles long text', () => {
    const longText = 'a'.repeat(1000)
    expect(estimateTokens(longText)).toBe(250) // 1000 chars = 250 tokens
  })

  it('handles text with whitespace', () => {
    expect(estimateTokens('hello world')).toBe(3) // 11 chars = ceil(2.75) = 3
  })
})
