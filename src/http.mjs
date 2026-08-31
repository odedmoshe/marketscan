/**
 * One place where every outbound request is made, so that every outbound
 * request has a deadline.
 *
 * This exists because the batch audit hung. A single listing that never
 * responds will otherwise stall a run of forty indefinitely — and the whole
 * pitch for `audit` is that you put it on a schedule, where nobody is watching
 * to notice it wedged. An unbounded fetch is fine in a one-shot lookup and
 * unacceptable in the thing this tool is actually for.
 */

export const UA = 'marketscan/0.1 (+maintenance signals for marketplace software)';

/** Generous enough for a slow marketplace, short enough that forty of them finish. */
const DEFAULT_TIMEOUT_MS = 12000;

export async function request(url, { method = 'GET', headers = {}, body, timeout = DEFAULT_TIMEOUT_MS } = {}) {
  try {
    return await fetch(url, {
      method,
      body,
      headers: { 'User-Agent': UA, ...headers },
      // AbortSignal.timeout is Node 18+, which is already the stated floor.
      signal: AbortSignal.timeout(timeout),
    });
  } catch (e) {
    // A timeout and a DNS failure arrive as different opaque errors; both mean
    // the same thing to a caller and both should read as one line, not a stack.
    const reason = e?.name === 'TimeoutError' || e?.name === 'AbortError'
      ? `no response in ${timeout / 1000}s`
      : e?.message || String(e);
    throw new Error(`${new URL(url).hostname}: ${reason}`);
  }
}
