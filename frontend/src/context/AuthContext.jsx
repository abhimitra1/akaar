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

  useEffect(() => {
    let cancelled = false

    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return
      setSession(data.session)
      if (data.session) setProfile(await fetchProfile(data.session.user.id))
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (cancelled) return
      setSession(newSession)
      setProfile(newSession ? await fetchProfile(newSession.user.id) : null)
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
    // trigger as email signup; Google's metadata just won't fill role/institution/department.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) throw new Error(error.message)
  }, [])

  const signup = useCallback(async (fields) => {
    const { email, password, full_name, role, institution, department } = fields
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name, role, institution, department } },
    })
    if (error) throw new Error(error.message)
    return data
  }, [])

  const logout = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  // Re-pulls the profile row into context after an update elsewhere (e.g.
  // CompleteProfilePage) — plain table updates don't fire onAuthStateChange, so without
  // this the cached profile (and its role) would stay stale until the next auth event.
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
