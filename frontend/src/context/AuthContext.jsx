import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'

const AuthContext = createContext(null)

async function fetchProfile(userId) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()
  if (error) return null
  return data
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  // True whenever a profile fetch is in flight — separate from `loading` (initial session
  // check only) because onAuthStateChange fires again later (token refresh, sign-in) without
  // going through that initial flow. While this is true, `user` below may be the {id, email}
  // fallback rather than the real profile — ProfileGate.jsx must not decide "needs terms" /
  // "needs profile" off that partial shape, or a user who already accepted terms briefly
  // reads as `terms_accepted_at` missing and gets bounced to /accept-terms for no reason.
  const [profileLoading, setProfileLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    supabase.auth.getSession().then(async ({ data }) => {
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
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error(error.message)
    return data
  }, [])

  const loginWithGoogle = useCallback(async () => {
    // Full-page redirect to Google, then back to redirectTo — supabase-js picks up the
    // session from the URL automatically on load, firing onAuthStateChange above. No
    // separate callback route needed. Profile row comes from the same handle_new_user()
    // trigger as email signup; Google's metadata just won't fill institution/department
    // (role is never taken from metadata either way — see handle_new_user() in schema.sql).
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) throw new Error(error.message)
  }, [])

  const signup = useCallback(async (fields) => {
    const { email, password, full_name, institution, department } = fields
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name, institution, department } },
    })
    if (error) throw new Error(error.message)
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
    setProfile(await fetchProfile(session.user.id))
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
