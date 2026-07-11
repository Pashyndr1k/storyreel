// Retry transient API failures (rate limits, overloaded, gateway errors)
// with exponential backoff + jitter. Non-transient errors rethrow immediately.
const RETRIABLE_STATUS = new Set([429, 500, 502, 503, 529]);
const RETRIABLE_TEXT = /overloaded|rate limit|resource_exhausted|try again|temporarily/i;

export function isTransient(err) {
  if (!err) return false;
  if (RETRIABLE_STATUS.has(err.status)) return true;
  return RETRIABLE_TEXT.test(String(err.message || ''));
}

export async function withRetry(fn, { attempts = 3, baseDelay = 1500 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (!isTransient(e) || i === attempts - 1) throw e;
      const delay = baseDelay * Math.pow(2, i) * (0.75 + Math.random() * 0.5);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
