import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { API_BASE_URL } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import LoadingScreen from '../components/LoadingScreen.jsx'
import './Library.css'

// My Library: the signed-in user's own crafts (public + private), with a status
// badge derived from the latest reconstruction job. Reuses Home's sidebar / tab
// bar class names (their CSS is global once HomePage imports Home.css) so the
// navigation is pixel-identical, and Home itself stays untouched.
const isProcessing = (craft) => craft.status === 'queued' || craft.status === 'processing'

// Status badges per DESIGN.md "Status Badges": pill-shaped, completed in the
// primary color, processing/failed in neutral/error tones.
function badgeFor(craft) {
  if (craft.status === 'completed') return { text: 'Completed', kind: 'completed' }
  if (craft.status === 'queued' || craft.status === 'processing')
    return { text: 'Processing', kind: 'processing' }
  if (craft.status === 'failed') return { text: 'Failed', kind: 'failed' }
  return null
}

export default function LibraryPage() {
  const navigate = useNavigate()
  const { user, accessToken } = useAuth()
  const [crafts, setCrafts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('all')
  const [menuFor, setMenuFor] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [deleteError, setDeleteError] = useState('')
  const menuRef = useRef(null)

  // Close the card menu on any outside click.
  useEffect(() => {
    if (menuFor === null) return
    const onDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuFor(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menuFor])

  useEffect(() => {
    const userId = user?.id
    if (userId == null) return
    let cancelled = false
    const load = async () => {
      try {
        const headers = { Authorization: `Bearer ${accessToken}` }
        // owner=<me> => my own crafts only (both public and private).
        const res = await fetch(`${API_BASE_URL}/api/crafts/?owner=${userId}`, { headers })
        if (!res.ok) throw new Error('Failed to load your library')
        const data = await res.json()
        setCrafts(data)
      } catch (err) {
        setError(err.message || 'Something went wrong')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [user?.id, accessToken])

  const handleTap = (craft) => {
    // Processing/queued/failed -> Processing screen (live state + retry/failure);
    // completed or unknown -> the View screen.
    if (isProcessing(craft) || craft.status === 'failed') {
      if (craft.job_id) navigate(`/processing/${craft.job_id}`)
      return // no job_id => just a badge, not clickable
    }
    navigate(`/craft/${craft.id}`)
  }

  const handleDelete = async (craft) => {
    if (!window.confirm(`Delete "${craft.title}"? This cannot be undone.`)) return
    setDeletingId(craft.id)
    setDeleteError('')
    try {
      const res = await fetch(`${API_BASE_URL}/api/crafts/${craft.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (res.status === 204) {
        // Optimistic: drop the card locally; the DB row is already gone.
        setCrafts((prev) => prev.filter((c) => c.id !== craft.id))
      } else {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail || 'Failed to delete craft')
      }
    } catch (err) {
      setDeleteError(err.message || 'Something went wrong')
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) {
    return <LoadingScreen message="Loading your library..." />
  }

  const tabCount = activeTab === 'all'
    ? crafts.length
    : crafts.filter((c) => isProcessing(c)).length

  return (
    <div className="library">
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
          <Link to="/library" className="home__sidebar-item home__sidebar-item--active">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5L4 5.5A2.5 2.5 0 0 1 6.5 3z" />
            </svg>
            <span>Library</span>
          </Link>
          <Link to="/account" className="home__sidebar-item">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
            </svg>
            <span>Profile</span>
          </Link>
        </div>
      </nav>

      <header className="library__header">
        <button type="button" className="library__back" aria-label="Back" onClick={() => navigate(-1)}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1 className="library__title">My Library</h1>
      </header>

      <div className="library__content">
        {error && (
          <div className="library__error-card">
            <p className="library__error">{error}</p>
            <button type="button" className="library__retry" onClick={() => window.location.reload()}>
              Retry
            </button>
          </div>
        )}

        {deleteError && <div className="library__delete-error">{deleteError}</div>}

        <div className="library__tabs">
          <button
            type="button"
            className={`library__tab ${activeTab === 'all' ? 'library__tab--active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            All
          </button>
          <button
            type="button"
            className={`library__tab ${activeTab === 'processing' ? 'library__tab--active' : ''}`}
            onClick={() => setActiveTab('processing')}
          >
            Processing
          </button>
        </div>

        {tabCount > 0 ? (
          <div className="library__grid">
            {crafts
              .filter((c) => (activeTab === 'all' ? true : isProcessing(c)))
              .map((craft) => {
                const badge = badgeFor(craft)
                return (
                  <article
                    key={craft.id}
                    data-craft-id={craft.id}
                    className="library__card"
                    onClick={() => handleTap(craft)}
                  >
                    <div className="library__thumb">
                      {craft.thumbnail_url ? (
                        <img src={craft.thumbnail_url} alt={craft.title} loading="lazy" className="library__thumb-img" />
                      ) : (
                        <div className="library__thumb-icon">
                          <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5L4 5.5A2.5 2.5 0 0 1 6.5 3z" />
                          </svg>
                        </div>
                      )}
                      {badge && (
                        <span className={`library__badge library__badge--${badge.kind}`}>{badge.text}</span>
                      )}
                      <div
                        className="library__menu"
                        ref={menuFor === craft.id ? menuRef : null}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="library__menu-btn"
                          aria-label="More options"
                          aria-expanded={menuFor === craft.id}
                          onClick={(e) => {
                            e.stopPropagation()
                            setMenuFor(menuFor === craft.id ? null : craft.id)
                          }}
                        >
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                            <circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" />
                          </svg>
                        </button>
                        {menuFor === craft.id && (
                          <div className="library__card-menu" role="menu">
                            <button
                              type="button"
                              role="menuitem"
                              className="library__menu-item"
                              disabled={deletingId === craft.id}
                              onClick={(e) => {
                                e.stopPropagation()
                                setMenuFor(null)
                                handleDelete(craft)
                              }}
                            >
                              {deletingId === craft.id ? 'Deleting…' : 'Delete'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    <h3 className="library__card-title">{craft.title}</h3>
                    <p className="library__card-sub">{craft.craft_type || 'Craft'}</p>
                  </article>
                )
              })}
          </div>
        ) : (
          <div className="library__empty-state">
            <div className="library__empty-icon-circle">
              <svg className="library__empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5.5 3l1.1 2.2L8.8 6.3 6.6 7.4 5.5 9.6 4.4 7.4 2.2 6.3l2.2-1.1L5.5 3z" />
                <path d="M18.5 5.5l.9 1.7 1.7.8-1.7.8-.9 1.7-.9-1.7-1.7-.8 1.7-.8.9-1.7z" />
                <path d="M3.5 10.2l8.5-3.8 8.5 3.8" />
                <path d="M3.5 10.2v6.8l8.5 3.8 8.5-3.8v-6.8" />
                <path d="M3.5 10.2l8.5 3.8 8.5-3.8" />
                <path d="M12 14v6.8" />
              </svg>
            </div>
            <p className="library__empty-title">
              {activeTab === 'all' ? 'No crafts yet.' : 'Nothing is processing.'}
            </p>
            <p className="library__empty-sub">
              {activeTab === 'all'
                ? 'Create your first digital twin'
                : 'Completed crafts appear under All.'}
            </p>
            <Link to="/create" className="library__empty-btn">
              {activeTab === 'all' ? 'Create a digital twin' : 'Create a new craft'}
            </Link>
          </div>
        )}
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
        <Link to="/library" className="home__tab-item home__tab-item--active">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5L4 5.5A2.5 2.5 0 0 1 6.5 3z" />
          </svg>
          <span>Library</span>
        </Link>
        <Link to="/account" className="home__tab-item">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
          </svg>
          <span>Profile</span>
        </Link>
      </nav>
    </div>
  )
}