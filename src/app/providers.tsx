import { useEffect, useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { syncEngine } from '@/core/db/sync-engine'
import { isSupabaseConfigured } from '@/core/supabase/client'

// The client is created inside the component so that a test can mount a fresh
// tree without inheriting cache from a previous test.
export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // The patient path never blocks on the network (rules.md 2 Telemetry).
            // Refetch-on-focus would put a request on a surface that must stay silent.
            refetchOnWindowFocus: false,
            retry: 2,
          },
        },
      }),
  )

  // The outbox fills whether or not anything drains it, so the engine is started
  // once here at the root rather than by a screen. Its triggers (online,
  // visibilitychange, a 60s poll) then run for the life of the app, including
  // while patient mode is on screen — which is the whole point, since that is
  // where the events come from.
  useEffect(() => {
    if (!isSupabaseConfigured()) return
    syncEngine.start()
    return () => syncEngine.stop()
  }, [])

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
