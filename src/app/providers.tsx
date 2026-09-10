import { useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

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

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
