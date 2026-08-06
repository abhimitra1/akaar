import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { API_BASE_URL } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import LoadingScreen from '../components/LoadingScreen.jsx'
import './Home.css'
import './Explore.css'

// Explore / Public Gallery (AGENTS.md Phase 5 Website side): all public crafts.
// Guests reach this screen too (a discovery tab), so it sends a Bearer header
// only when logged in; the backend treats is_public=true as guest-safe.
const CATEGORY_CHIPS = ['Pottery', 'Textiles', 'Wood', 'Metal']

export default function ExplorePage() {
  const navigate = useNavigate()
  const { accessToken } = useAuth()
  const [crafts, setCrafts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [failedThumbs, setFailedThumbs] = useState(() => new Set())

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : {}
        // Guests: no header (backend returns public only). Logged-in: is_public=true
        // still forces only public crafts, so this is the Public Gallery feed.
        const res = await fetch(`${API_BASE_URL}/api/crafts?is_public=true`, { headers })
        if (!res.ok) throw new Error('Failed to load crafts')
        const data = await res.json()
        if (!cancelled) setCrafts(data)
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

  const markThumbFailed = (id) => setFailedThumbs((prev) => { const n = new Set(prev); n.add(id); return n })

  // ponytail: like Home, craft_type filtering is done client-side (the backend
  // list endpoint has no craft_type param).
  const visibleCrafts = selectedCategory
    ? crafts.filter((c) => c.craft_type === selectedCategory)
    : crafts

  if (loading) {
    return <LoadingScreen message="Loading public crafts..." />
  }

  return (
    <div className="explore">
      <nav className="home__sidebar">
        <div className="home__sidebar-brand">AKAAR</div>
        <div className="home__sidebar-nav">
          <Link to="/" className="home__sidebar-item">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            <span>Home</span>
          </Link>
          <Link to="/explore" className="home__sidebar-item home__sidebar-item--active">
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
          <Link to="/account" className="home__sidebar-item">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
            </svg>
            <span>Profile</span>
          </Link>
        </div>
      </nav>

      <header className="explore__header">
        <h1 className="explore__title">Explore Crafts</h1>
      </header>

      <div className="explore__content">
        {error && (
          <div className="explore__error-card">
            <p className="explore__error">{error}</p>
            <button type="button" className="explore__retry" onClick={() => window.location.reload()}>
              Retry
            </button>
          </div>
        )}

        <div className="explore__filter-row">
          {CATEGORY_CHIPS.map((chip) => (
            <button
              key={chip}
              className={`explore__chip ${selectedCategory === chip ? 'explore__chip--active' : ''}`}
              onClick={() => setSelectedCategory(chip === selectedCategory ? '' : chip)}
            >
              {chip}
            </button>
          ))}
        </div>

        {visibleCrafts.length > 0 ? (
          <div className="explore__grid">
            {visibleCrafts.map((craft) => (
              <article
                key={craft.id}
                className="explore__card"
                onClick={() => navigate(`/craft/${craft.id}`)}
              >
                <div className="explore__thumb">
                  {craft.thumbnail_url && !failedThumbs.has(craft.id) ? (
                    <img src={craft.thumbnail_url} alt={craft.title} loading="lazy" className="explore__thumb-img" onError={() => markThumbFailed(craft.id)} />
                  ) : (
                    <div className="explore__thumb-icon">
                      <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" />
                      </svg>
                    </div>
                  )}
                </div>
                <h3 className="explore__card-title">{craft.title}</h3>
                <p className="explore__card-sub">{craft.craft_type || 'Craft'}</p>
              </article>
            ))}
          </div>
        ) : (
          <div className="explore__empty-state">
            <div className="explore__empty-icon-circle">
              <svg className="explore__empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5.5 3l1.1 2.2L8.8 6.3 6.6 7.4 5.5 9.6 4.4 7.4 2.2 6.3l2.2-1.1L5.5 3z" />
                <path d="M18.5 5.5l.9 1.7 1.7.8-1.7.8-.9 1.7-.9-1.7-1.7-.8 1.7-.8.9-1.7z" />
                <path d="M3.5 10.2l8.5-3.8 8.5 3.8" />
                <path d="M3.5 10.2v6.8l8.5 3.8 8.5-3.8v-6.8" />
                <path d="M3.5 10.2l8.5 3.8 8.5-3.8" />
                <path d="M12 14v6.8" />
              </svg>
            </div>
            <p className="explore__empty-title">No public crafts yet.</p>
            <p className="explore__empty-sub">Published crafts will appear here.</p>
            <Link to="/create" className="explore__empty-btn">Create a digital twin</Link>
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
        <Link to="/explore" className="home__tab-item home__tab-item--active">
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