import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'

const AuthContext = createContext(null)

// Supabase calls below (getSession, the profile fetch, signInWithPassword) have no
// built-in timeout — a stalled network request or the known gotrue-js session-lock
// contention bug can leave one pending indefinitely. Without a ceiling, that hang
// propagates into `loading`/`profileLoading` never resolving, which leaves every
// ProtectedRoute stuck on LoadingScreen's spinner forever with no way for the user to
// recover. Racing against a timeout guarantees these always settle one way or another.
const NETWORK_TIMEOUT_MS = 8000

function withTimeout(promise, fallback) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(fallback), NETWORK_TIMEOUT_MS)),
  ])
}

// Google sign-up is a full-page redirect to the provider and back, so there's no moment
// between "user checked the box on SignUpPage" and "session exists" to write
// terms_accepted_at directly — this flag carries that intent across the redirect. Only
// SignUpPage's Google button sets it (SignInPage's never does), so a plain Google sign-in
// by an existing/unaccepted account never gets silently stamped as consenting.
const GOOGLE_TERMS_INTENT_KEY = 'paths_google_terms_intent'

async function fetchProfile(userId) {
  const { data, error } = await withTimeout(
    supabase.from('profiles').select('*').eq('id', userId).single(),
    { data: null, error: 'profile fetch timed out' },
  )
  if (error) return null
  if (data && !data.terms_accepted_at && localStorage.getItem(GOOGLE_TERMS_INTENT_KEY)) {
    localStorage.removeItem(GOOGLE_TERMS_INTENT_KEY)
    const { data: updated } = await supabase
      .from('profiles')
      .update({ terms_accepted_at: new Date().toISOString() })
      .eq('id', userId)
      .select('*')
      .single()
    if (updated) return updated
  }
  return data
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  // True whenever a profile fetch is in flight — separate from `loading` (initial session
  // check only) because onAuthStateChange fires again later (token refresh, sign-in) without
  // going through that initial flow. While this is true, `user` below may be the {id, email}
  // fallback rather than the real profile.
  const [profileLoading, setProfileLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    withTimeout(supabase.auth.getSession(), { data: { session: null } }).then(async ({ data }) => {
      if (cancelled) return
      setSession(data.session)
      if (data.session) {
        setProfile(await fetchProfile(data.session.user.id))
      }
      if (cancelled) return
      setLoading(false)
      setProfileLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (cancelled) return
      setSession(newSession)
      if (!newSession) {
        setProfile(null)
        setProfileLoading(false)
        return
      }
      setProfileLoading(true)
      const p = await fetchProfile(newSession.user.id)
      if (cancelled) return
      setProfile(p)
      setProfileLoading(false)
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  const isAuthenticated = Boolean(session)

  const login = useCallback(async (email, password) => {
    const { data, error } = await withTimeout(supabase.auth.signInWithPassword({ email, password }), {
      data: null,
      error: { message: 'Sign-in timed out. Please check your connection and try again.' },
    })
    if (error) throw new Error(error.message)
    return data
  }, [])

  const loginWithGoogle = useCallback(async ({ acceptedTerms = false } = {}) => {
    // Full-page redirect to Google, then back to redirectTo — supabase-js picks up the
    // session from the URL automatically on load, firing onAuthStateChange above. No
    // separate callback route needed. Profile row comes from the same handle_new_user()
    // trigger as email signup; Google's metadata just won't fill institution/department
    // (role is never taken from metadata either way — see handle_new_user() in schema.sql).
    if (acceptedTerms) {
      localStorage.setItem(GOOGLE_TERMS_INTENT_KEY, '1')
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) {
      localStorage.removeItem(GOOGLE_TERMS_INTENT_KEY)
      throw new Error(error.message)
    }
  }, [])

  const signup = useCallback(async (fields) => {
    const { email, password, full_name, institution, department, acceptedTerms } = fields
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name, institution, department } },
    })
    if (error) throw new Error(error.message)
    if (acceptedTerms && data.user) {
      await supabase
        .from('profiles')
        .update({ terms_accepted_at: new Date().toISOString() })
        .eq('id', data.user.id)
    }
    return data
  }, [])

  const logout = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  // Re-pulls the profile row into context after an update elsewhere (e.g. AccountPage's
  // edit form or its "Apply to become an Artisan" button) — plain table updates don't fire
  // onAuthStateChange, so without this the cached profile would stay stale until the next
  // auth event.
  const refreshProfile = useCallback(async () => {
    if (!session) return
    setProfileLoading(true)
    setProfile(await fetchProfile(session.user.id))
    setProfileLoading(false)
  }, [session])

  const user = profile
    ? { ...profile, id: profile.id }
    : session
      ? { id: session.user.id, email: session.user.email }
      : null

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        accessToken: session?.access_token ?? null,
        isAuthenticated,
        loading,
        profileLoading,
        login,
        loginWithGoogle,
        logout,
        signup,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (ctx === null) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
