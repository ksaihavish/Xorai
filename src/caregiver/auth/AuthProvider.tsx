import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/core/supabase/client'
import { ensureCaregiverRow } from '@/caregiver/auth/api'

type AuthState = {
  session: Session | null
  /** Distinguishes "not signed in" from "we do not know yet". */
  ready: boolean
}

const AuthContext = createContext<AuthState>({ session: null, ready: false })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, ready: false })

  useEffect(() => {
    let active = true

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setState({ session: data.session, ready: true })
      if (data.session) void ensureCaregiverRow()
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return
      setState({ session, ready: true })
      if (event === 'SIGNED_IN' && session) void ensureCaregiverRow()
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  return useContext(AuthContext)
}

export function useCaregiverId(): string | null {
  return useAuth().session?.user.id ?? null
}
