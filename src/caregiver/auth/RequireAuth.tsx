import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/caregiver/auth/AuthProvider'

/**
 * Guards caregiver routes only. There is deliberately no patient equivalent:
 * architecture.md 3 — the patient never authenticates. After the caregiver signs
 * in the device is bound, and entering patient mode is tapping a large photo.
 *
 * The redirect carries the attempted location so a caregiver who followed a link
 * lands where they meant to rather than on a dashboard.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, ready } = useAuth()
  const location = useLocation()

  // Rendering the sign-in screen before the stored session has been read would
  // flash a login form at someone who is already signed in.
  if (!ready) return null

  if (!session) {
    return <Navigate to="/auth/sign-in" replace state={{ from: location.pathname }} />
  }

  return <>{children}</>
}
