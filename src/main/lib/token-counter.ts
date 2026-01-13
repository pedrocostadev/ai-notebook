// LRU cache for token estimates - avoids recalculating for same text
const TOKEN_CACHE_SIZE = 500
const tokenCache = new Map<string, number>()

export function estimateTokens(text: string): number {
  // Use text hash for cache key (first 100 chars + length is unique enough)
  const cacheKey = text.length <= 100 ? text : `${text.slice(0, 100)}:${text.length}`

  const cached = tokenCache.get(cacheKey)
  if (cached !== undefined) {
    // Move to end (LRU refresh)
    tokenCache.delete(cacheKey)
    tokenCache.set(cacheKey, cached)
    return cached
  }

  const estimate = Math.ceil(text.length / 4)

  // Evict oldest if cache full
  if (tokenCache.size >= TOKEN_CACHE_SIZE) {
    const firstKey = tokenCache.keys().next().value
    if (firstKey !== undefined) {
      tokenCache.delete(firstKey)
    }
  }

  tokenCache.set(cacheKey, estimate)
  return estimate
}
