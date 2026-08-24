/**
 * Persistent-storage permission request (#44).
 *
 * `navigator.storage.persist()` asks the browser to exempt this origin from
 * automatic eviction under disk pressure. It is wrapped so the caller gets a
 * plain boolean and can render two risk levels from it. The wrapper returns
 * `false` when the API is missing or throws — the pessimistic default, matching
 * the "better the user worries" rule.
 *
 * The boolean must never be described as "safe": persistence is about
 * *automatic* eviction only, and the user clearing site data loses everything
 * regardless of the answer.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || typeof navigator.storage?.persist !== 'function') {
    return false
  }
  try {
    return await navigator.storage.persist()
  } catch {
    return false
  }
}
