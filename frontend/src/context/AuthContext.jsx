import { createContext, useCallback, useContext, useState } from 'react'
import { API_BASE_URL } from '../api.js'

const AuthContext = createContext(null)

// Single localStorage key holding { access_token, refresh_token, user } so a full
// page reload restores the session instead of bouncing to /welcome.
const STORAGE_KEY = 'akaar_auth'

// Safe read: corrupted/invalid JSON or unavailable storage => logged out.
function readStoredAuth() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && parsed.access_token && parsed.refresh_token && parsed.user) {
      return parsed
    }
  } catch {
    // fall through to logged-out state
  }
  return null
}

export function AuthProvider({ children }) {
  // Lazy init: restore the persisted session on first render (refresh-safe).
  const [storedAuth] = useState(readStoredAuth)
  const [user, setUser] = useState(() => storedAuth?.user ?? null)
  const [accessToken, setAccessToken] = useState(() => storedAuth?.access_token ?? null)
  const [refreshToken, setRefreshToken] = useState(() => storedAuth?.refresh_token ?? null)

  const isAuthenticated = Boolean(accessToken)

  const applyAuth = useCallback((data) => {
    setUser(data.user)
    setAccessToken(data.access_token)
    setRefreshToken(data.refresh_token)
    // Persist alongside React state so refreshes keep the user logged in.
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          user: data.user,
        }),
      )
    } catch {
      // Storage unavailable (e.g. private mode) — session lives in memory only.
    }
  }, [])

  const login = useCallback(
    async (email, password, remember = false) => {
      const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail || 'Login failed')
      applyAuth(data)
      return data
    },
    [applyAuth],
  )

  const signup = useCallback(
    async (fields) => {
      const res = await fetch(`${API_BASE_URL}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail || 'Sign up failed')
      applyAuth(data)
      return data
    },
    [applyAuth],
  )

  const logout = useCallback(() => {
    setUser(null)
    setAccessToken(null)
    setRefreshToken(null)
    // Clear persisted state so a refresh after logout stays logged out.
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // best effort
    }
  }, [])

  return (
    <AuthContext.Provider
      value={{ user, accessToken, refreshToken, isAuthenticated, login, logout, signup }}
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
