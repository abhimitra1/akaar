import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { API_BASE_URL } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import LoadingScreen from '../components/LoadingScreen.jsx'
import './Home.css'
import './Account.css'

// Account Center (AGENTS.md Phase 6, read-only slice): profile fields come from
// GET /api/auth/me. Editing, avatar, sessions, preferences, delete = PHASE 2.
const ROLE_LABELS = {
  visitor: 'Visitor',
  student: 'Student',
  artisan: 'Artisan',
  faculty: 'Faculty',
  researcher: 'Researcher',
  designer: 'Designer',
}

export default function AccountPage() {
  const navigate = useNavigate()
  const { accessToken, logout } = useAuth()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (!res.ok) throw new Error('Failed to load profile')
        const data = await res.json()
        if (!cancelled) setProfile(data)
      } catch (err) {
        if (!cancelled) setError(err.message || 'Something went wrong')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [accessToken])

  const handleLogout = () => {
    logout()
    navigate('/welcome')
  }

  if (loading) {
    return <LoadingScreen message="Loading your profile..." />
  }

  const rows = [
    ['Full name', profile?.full_name],
    ['Email', profile?.email],
    ['Role', profile?.role ? ROLE_LABELS[profile.role] || profile.role : null],
    ['Institution', profile?.institution],
    ['Department', profile?.department],
  ]

  return (
    <div className="account">
      <nav className="home__sidebar">
        <div className="home__sidebar-brand">AKAAR</div>
        <div className="home__sidebar-nav">
          <Link to="/" className="home__sidebar-item">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            <span>Home</span>
          </Link>
          <Link to="/explore" className="home__sidebar-item">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" /><line x1="9" y1="3" x2="9" y2="18" /><line x1="15" y1="6" x2="15" y2="21" />
            </svg>
            <span>Explore</span>
          </Link>
          <Link to="/create" className="home__sidebar-item">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" /><path d="M17 21v-8" /><path d="M5 9h14V5H5v4" /><path d="M12 3v18" />
            </svg>
            <span>Create</span>
          </Link>
          <Link to="/library" className="home__sidebar-item">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5L4 5.5A2.5 2.5 0 0 1 6.5 3z" />
            </svg>
            <span>Library</span>
          </Link>
          <Link to="/account" className="home__sidebar-item home__sidebar-item--active">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
            </svg>
            <span>Profile</span>
          </Link>
        </div>
      </nav>

      <header className="account__header">
        <button type="button" className="account__back" aria-label="Back" onClick={() => navigate(-1)}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1 className="account__title">Account</h1>
      </header>

      <div className="account__content">
        {error && (
          <div className="account__error-card">
            <p className="account__error">{error}</p>
            <button type="button" className="account__retry" onClick={() => window.location.reload()}>
              Retry
            </button>
          </div>
        )}

        <div className="account__card">
          {rows.map(([label, value], i) => (
            <div className="account__row" key={label}>
              <span className="account__row-label">{label}</span>
              <span className="account__row-value">{value || '—'}</span>
            </div>
          ))}
        </div>

        <button type="button" className="account__logout" onClick={handleLogout}>
          Log out
        </button>
      </div>

      <nav className="home__tab-bar">
        <Link to="/" className="home__tab-item">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          <span>Home</span>
        </Link>
        <Link to="/explore" className="home__tab-item">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" /><line x1="9" y1="3" x2="9" y2="18" /><line x1="15" y1="6" x2="15" y2="21" />
          </svg>
          <span>Explore</span>
        </Link>
        <Link to="/create" className="home__tab-item">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" /><path d="M17 21v-8" /><path d="M5 9h14V5H5v4" /><path d="M12 3v18" />
          </svg>
          <span>Create</span>
        </Link>
        <Link to="/library" className="home__tab-item">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5L4 5.5A2.5 2.5 0 0 1 6.5 3z" />
          </svg>
          <span>Library</span>
        </Link>
        <Link to="/account" className="home__tab-item home__tab-item--active">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
          </svg>
          <span>Profile</span>
        </Link>
      </nav>
    </div>
  )
}
