import * as React from 'react'
import { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, sanitizeError } from '../lib/supabase'
import type { Profile, UserRole } from '../lib/supabase'

// ============================================================
// Constants
// ============================================================
const MAX_ATTEMPTS = 3
const LOCKOUT_SECONDS = 30
const IDLE_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes

interface AuthContextType {
  user: User | null
  profile: Profile | null
  loading: boolean
  loginAttempts: number
  lockedUntil: number | null
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [loginAttempts, setLoginAttempts] = useState(0)
  const [lockedUntil, setLockedUntil] = useState<number | null>(null)
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ─── Idle timeout reset ───────────────────────────────────
  const resetIdleTimer = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(async () => {
      if (user) {
        await supabase.auth.signOut()
        setUser(null)
        setProfile(null)
      }
    }, IDLE_TIMEOUT_MS)
  }, [user])

  useEffect(() => {
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart']
    events.forEach(e => window.addEventListener(e, resetIdleTimer, { passive: true }))
    return () => events.forEach(e => window.removeEventListener(e, resetIdleTimer))
  }, [resetIdleTimer])

  // ─── Profile fetch (no console.log) ──────────────────────
  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    if (data) {
      setProfile(data as Profile)
    } else {
      setProfile(null)
    }
  }

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id).finally(() => setLoading(false))
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else setProfile(null)
    })

    return () => subscription.unsubscribe()
  }, [])

  // ─── Sign in with rate limiting ───────────────────────────
  const signIn = async (email: string, password: string): Promise<{ error: string | null }> => {
    // Check lockout
    if (lockedUntil && Date.now() < lockedUntil) {
      const remaining = Math.ceil((lockedUntil - Date.now()) / 1000)
      return { error: `Too many failed attempts. Try again in ${remaining}s.` }
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      const attempts = loginAttempts + 1
      setLoginAttempts(attempts)
      if (attempts >= MAX_ATTEMPTS) {
        setLockedUntil(Date.now() + LOCKOUT_SECONDS * 1000)
        setLoginAttempts(0)
        return { error: `Too many failed attempts. Please wait ${LOCKOUT_SECONDS} seconds.` }
      }
      return { error: sanitizeError(error) }
    }

    // Success: reset counter
    setLoginAttempts(0)
    setLockedUntil(null)
    if (data.user) {
      await fetchProfile(data.user.id)
      resetIdleTimer()
    }
    return { error: null }
  }

  const signOut = async () => {
    if (idleTimer.current) clearTimeout(idleTimer.current)
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, loginAttempts, lockedUntil, signIn, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
