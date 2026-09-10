import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppProviders } from '@/app/providers'
import { AppRouter } from '@/app/router'
import '@/styles/tokens.css'

const rootElement = document.getElementById('root')

// rules.md 1.8 bans the non-null assertion outside tests, so this is a real guard.
if (!rootElement) {
  throw new Error('Mount point #root is missing from index.html')
}

createRoot(rootElement).render(
  <StrictMode>
    <AppProviders>
      <AppRouter />
    </AppProviders>
  </StrictMode>,
)
