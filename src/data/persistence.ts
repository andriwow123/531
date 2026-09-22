/**
 * Requests durable ("persistent") storage from the browser so the OS/browser
 * won't silently evict this app's IndexedDB data under storage pressure.
 * Best-effort: safe to call in any environment (SSR, tests, unsupported
 * browsers) since every browser-API access is feature-detected and wrapped.
 */
export async function requestPersistentStorage(): Promise<void> {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.persist === 'function') {
      const already = typeof navigator.storage.persisted === 'function' ? await navigator.storage.persisted() : false;
      if (!already) await navigator.storage.persist();
    }
  } catch {
    // best-effort; ignore
  }
}
