import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { API_BASE_URL } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import LoadingScreen from '../components/LoadingScreen.jsx'
import './Home.css'

const CATEGORY_CHIPS = ['Pottery', 'Textiles', 'Wood', 'Metal']

export default function HomePage() {
  const navigate = useNavigate()
  const { accessToken } = useAuth()
  const [crafts, setCrafts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [failedThumbs, setFailedThumbs] = useState(() => new Set())

  useEffect(() => {
    const fetchCrafts = async () => {
      try {
        // Guests: no header. Signed-in: Bearer token so owned/private crafts are included.
        const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : {}
        const res = await fetch(`${API_BASE_URL}/api/crafts`, { headers })
        if (!res.ok) throw new Error('Failed to load crafts')
        const data = await res.json()
        setCrafts(data)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchCrafts()
  }, [accessToken])

  // ponytail: craft_type filtering is done client-side (backend list endpoint
  // has no craft_type param).
  const visibleCrafts = selectedCategory
    ? crafts.filter(c => c.craft_type === selectedCategory)
    : crafts
  const featuredCrafts = visibleCrafts.filter(c => c.is_public).slice(0, 3)
  const recentCrafts = visibleCrafts.filter(c => c.is_public).slice(0, 5)

  // Backend list endpoint returns a browser-reachable presigned thumbnail_url per
  // craft (craft.thumbnail_url). Use it directly — the old dead
  // `/api/crafts/{id}/photos/{key}` pattern has no backend route and 404s, which
  // showed as broken-image icons. If it's missing or fails to load, show a neutral
  // placeholder icon instead of a broken image.
  const markThumbFailed = id => setFailedThumbs(prev => { const n = new Set(prev); n.add(id); return n })
  const thumbImg = (craft, imgClass) =>
    craft.thumbnail_url && !failedThumbs.has(craft.id)
      ? <img src={craft.thumbnail_url} alt={craft.title} className={imgClass} loading="lazy"
           onError={() => markThumbFailed(craft.id)} />
      : null

  // Shared neutral placeholder (shown when a craft has no thumbnail or it errors).
  const ThumbPlaceholder = ({ type }) => (
    <div data-placeholder type={type} className={`home__thumb-placeholder home__thumb-placeholder--${type}`}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" />
      </svg>
    </div>
  )

  if (loading) {
    return <LoadingScreen message="Loading crafts..." />
  }

  return (
    <div className="home">
      <nav className="home__sidebar">
        <div className="home__sidebar-brand">AKAAR</div>
        <div className="home__sidebar-nav">
          <Link to="/" className="home__sidebar-item home__sidebar-item--active">
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
          <Link to="/account" className="home__sidebar-item">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
            </svg>
            <span>Profile</span>
          </Link>
        </div>
      </nav>

      <header className="home__top-bar">
        <div className="home__brand">AKAAR</div>
        <button className="home__icon-btn" aria-label="Search">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>
      </header>

      <section className="home__content">
        <h1 className="home__title">Explore Crafts</h1>

        {featuredCrafts.length > 0 && (
          <div className="home__featured-section">
            <div className="home__section-header">
              <h2 className="home__section-title">Featured Collection</h2>
              <Link to="/explore" className="home__section-link">View all</Link>
            </div>
            <div className="home__featured-row">
              {featuredCrafts.map(craft => (
                <article key={craft.id} className="home__featured-card" onClick={() => navigate(`/craft/${craft.id}`)}>
                  <div className="home__featured-image-wrapper">
                    {thumbImg(craft, 'home__featured-image') || <ThumbPlaceholder type="featured" />}
                    <span className="home__featured-badge">Featured</span>
                  </div>
                  <div className="home__featured-body">
                    <h3 className="home__featured-title">{craft.title}</h3>
                    <p className="home__featured-subtitle">By {craft.owner_id}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}

        <div className="home__filters">
          <div className="home__filter-row">
            {CATEGORY_CHIPS.map(chip => (
              <button
                key={chip}
                className={`home__chip ${selectedCategory === chip ? 'home__chip--active' : ''}`}
                onClick={() => setSelectedCategory(chip === selectedCategory ? '' : chip)}
              >
                {chip}
              </button>
            ))}
          </div>
        </div>

        <div className="home__section-header home__recent-header">
          <h2 className="home__section-title">Recent Uploads</h2>
        </div>

        {recentCrafts.length > 0 ? (
          <div className="home__recent-list">
            {recentCrafts.map(craft => (
              <article key={craft.id} className="home__recent-row">
                <div className="home__recent-thumbnail-wrapper">
                  {thumbImg(craft, 'home__recent-thumbnail') || <ThumbPlaceholder type="recent" />}
                </div>
                <div className="home__recent-body">
                  <h3 className="home__recent-title">{craft.title}</h3>
                  <p className="home__recent-subtitle">By {craft.owner_id}</p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="home__empty-state">
            <div className="home__empty-icon-circle">
              <svg className="home__empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5.5 3l1.1 2.2L8.8 6.3 6.6 7.4 5.5 9.6 4.4 7.4 2.2 6.3l2.2-1.1L5.5 3z" />
                <path d="M18.5 5.5l.9 1.7 1.7.8-1.7.8-.9 1.7-.9-1.7-1.7-.8 1.7-.8.9-1.7z" />
                <path d="M3.5 10.2l8.5-3.8 8.5 3.8" />
                <path d="M3.5 10.2v6.8l8.5 3.8 8.5-3.8v-6.8" />
                <path d="M3.5 10.2l8.5 3.8 8.5-3.8" />
                <path d="M12 14v6.8" />
              </svg>
            </div>
            <p className="home__empty-title">No crafts uploaded yet.</p>
            <p className="home__empty-sub">Be the first to share your creation!</p>
          </div>
        )}
      </section>

      <Link to="/create" className="home__fab" aria-label="Create new craft">
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </Link>

      <nav className="home__tab-bar">
        <Link to="/" className="home__tab-item home__tab-item--active">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          <span>Home</span>
        </Link>
        <Link to="/explore" className="home__tab-item">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" /><line x1="9" y1="3" x2="9" y2="18" /><line x1="15" y1="6" x2="15" y2="21" /><line x1="5" y1="12" x2="19" y2="12" />
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
