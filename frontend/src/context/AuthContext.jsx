import { createContext, useCallback, useContext, useState } from 'react'
import { API_BASE_URL } from '../api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  // Tokens held in memory (React state) only — no localStorage/httpOnly cookies yet.
  const [user, setUser] = useState(null)
  const [accessToken, setAccessToken] = useState(null)
  const [refreshToken, setRefreshToken] = useState(null)

  const isAuthenticated = Boolean(accessToken)

  const applyAuth = useCallback((data) => {
    setUser(data.user)
    setAccessToken(data.access_token)
    setRefreshToken(data.refresh_token)
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
