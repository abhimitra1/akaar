import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { API_BASE_URL } from '../api.js'
import './Home.css'

const CATEGORY_CHIPS = ['Pottery', 'Textiles', 'Wood', 'Metal']

export default function HomePage() {
  const navigate = useNavigate()
  const [crafts, setCrafts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')

  useEffect(() => {
    const fetchCrafts = async () => {
      try {
        const url = new URL(`${API_BASE_URL}/api/crafts`)
        if (selectedCategory) url.searchParams.set('craft_type', selectedCategory)
        const res = await fetch(url)
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
  }, [selectedCategory])

  const featuredCrafts = crafts.filter(c => c.is_public).slice(0, 3)
  const recentCrafts = crafts.filter(c => c.is_public).slice(0, 5)

  const getCraftThumbnail = craft => {
    if (craft.photos && craft.photos.length > 0) {
      return `${API_BASE_URL}/api/crafts/${craft.id}/photos/${craft.photos[0]}`
    }
    return null
  }

  if (loading) {
    return <div className="home loading">Loading…</div>
  }

  return (
    <div className="home">
      <header className="home__top-bar" style={{ background: 'var(--surface-container-high)' }}>
        <button className="home__icon-btn" aria-label="Menu">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <div className="home__brand">AKAAR</div>
        <Link to="/search" className="home__icon-btn" aria-label="Search">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </Link>
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
                <article key={craft.id} className="home__featured-card" onClick={() => navigate(`/crafts/${craft.id}`)}>
                  <div className="home__featured-image-wrapper">
                    {getCraftThumbnail(craft) ? (
                      <img src={getCraftThumbnail(craft)} alt={craft.title} className="home__featured-image" loading="lazy" />
                    ) : (
                      <div className="home__featured-placeholder" />
                    )}
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
                  {getCraftThumbnail(craft) ? (
                    <img src={getCraftThumbnail(craft)} alt={craft.title} className="home__recent-thumbnail" loading="lazy" />
                  ) : (
                    <div className="home__recent-placeholder" />
                  )}
                </div>
                <div className="home__recent-body">
                  <h3 className="home__recent-title">{craft.title}</h3>
                  <p className="home__recent-subtitle">By {craft.owner_id}</p>
                </div>
                <button className="home__recent-menu-btn" aria-label="More options">
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="1" /><circle cx="12" cy="5" r="1" /><circle cx="12" cy="19" r="1" />
                  </svg>
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="home__empty-state">
            <p>No crafts uploaded yet.</p>
            <p className="home__empty-sub">Be the first to share your creation!</p>
          </div>
        )}
      </section>

      <Link to="/create" className="home__fab" aria-label="Create new craft">
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </Link>

      <nav className="home__tab-bar" style={{ background: 'var(--surface-container-high)' }}>
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
