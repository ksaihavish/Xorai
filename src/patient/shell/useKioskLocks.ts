import { useEffect } from 'react'

/**
 * architecture.md 3: patient mode locks landscape where supported, keeps a wake
 * lock, and disables text selection, context menu and pull-to-refresh.
 *
 * Every one of these is best-effort. A browser that refuses is not an error the
 * patient may ever see (design.md 6) — the session simply continues, so each call
 * is guarded and each failure is swallowed here rather than raised.
 *
 * The wake lock is re-acquired on visibilitychange because the browser drops it
 * whenever the document is hidden, and a tablet that sleeps mid-session ends the
 * session as surely as a crash would.
 */
export function useKioskLocks(active: boolean): void {
  useEffect(() => {
    if (!active) return

    let sentinel: WakeLockSentinel | null = null
    let cancelled = false

    const acquire = async () => {
      if (!('wakeLock' in navigator)) return
      try {
        const lock = await navigator.wakeLock.request('screen')
        if (cancelled) {
          void lock.release()
          return
        }
        sentinel = lock
      } catch {
        // Denied, unsupported, or the document was not visible. Nothing to do.
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void acquire()
    }

    void acquire()
    document.addEventListener('visibilitychange', onVisibility)

    const orientation: ScreenOrientation & {
      lock?: (o: 'landscape') => Promise<void>
    } = screen.orientation

    try {
      void orientation.lock?.('landscape').catch(() => {
        // Refused on desktop and on iOS. Expected, not a failure.
      })
    } catch {
      // Older engines throw synchronously instead of rejecting.
    }

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      if (sentinel) void sentinel.release().catch(() => {})
      try {
        screen.orientation.unlock?.()
      } catch {
        // Same as above.
      }
    }
  }, [active])
}
