import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient.js'
import { useAuth } from '../context/AuthContext.jsx'
import AppNav from '../components/AppNav.jsx'
import AiGeneratedBadge from '../components/AiGeneratedBadge.jsx'
import LoadingScreen from '../components/LoadingScreen.jsx'
import './Home.css'

const CATEGORY_CHIPS = ['Pottery', 'Terracotta', 'Wood', 'Metal']

export default function HomePage() {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()
  const [crafts, setCrafts] = useState([])
  const [ownerNames, setOwnerNames] = useState({}) // owner_id -> full_name
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')

  useEffect(() => {
    const fetchCrafts = async () => {
      try {
        // RLS on crafts (is_public OR owner_id = auth.uid()) already scopes this:
        // guests see public crafts, signed-in users also see their own.
        const { data, error: dbError } = await supabase
          .from('crafts')
          .select('*')
          .order('created_at', { ascending: false })
        if (dbError) throw new Error(dbError.message)
        setCrafts(data)

        const ownerIds = [...new Set(data.map((c) => c.owner_id))]
        if (ownerIds.length > 0) {
          const { data: owners } = await supabase
            .from('public_profiles')
            .select('id, full_name')
            .in('id', ownerIds)
          if (owners) {
            setOwnerNames(Object.fromEntries(owners.map((o) => [o.id, o.full_name])))
          }
        }
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchCrafts()
  }, [isAuthenticated])

  // ponytail: craft_type filtering is done client-side (matches prior backend behavior).
  const visibleCrafts = selectedCategory
    ? crafts.filter(c => c.craft_type === selectedCategory)
    : crafts
  const featuredCrafts = visibleCrafts.filter(c => c.is_public).slice(0, 8)
  const recentCrafts = visibleCrafts.filter(c => c.is_public).slice(0, 5)

  const getCraftThumbnail = craft => {
    // photos[] holds public Storage URLs directly (see CreatePage upload).
    return craft.photos && craft.photos.length > 0 ? craft.photos[0] : null
  }

  return (
    <div className="home">
      <AppNav active="home" />

      <section className="home__content">
        <h1 className="home__title">Explore Crafts</h1>

        {loading ? (
          <LoadingScreen message="Loading crafts..." inline />
        ) : (
          <>
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
                        {getCraftThumbnail(craft) ? (
                          <img src={getCraftThumbnail(craft)} alt={craft.title} className="home__featured-image" loading="lazy" />
                        ) : (
                          <div className="home__featured-placeholder" />
                        )}
                        <span className="home__featured-badge">Featured</span>
                        {craft.image_source === 'ai_generated' && <AiGeneratedBadge />}
                      </div>
                      <div className="home__featured-body">
                        <h3 className="home__featured-title">{craft.title}</h3>
                        <p className="home__featured-subtitle">By {ownerNames[craft.owner_id] || 'Unknown creator'}</p>
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
                  <article
                    key={craft.id}
                    className="home__recent-row"
                    onClick={() => navigate(`/craft/${craft.id}`)}
                  >
                    <div className="home__recent-thumbnail-wrapper">
                      {getCraftThumbnail(craft) ? (
                        <img src={getCraftThumbnail(craft)} alt={craft.title} className="home__recent-thumbnail" loading="lazy" />
                      ) : (
                        <div className="home__recent-placeholder" />
                      )}
                      {craft.image_source === 'ai_generated' && <AiGeneratedBadge />}
                    </div>
                    <div className="home__recent-body">
                      <h3 className="home__recent-title">{craft.title}</h3>
                      <p className="home__recent-subtitle">By {ownerNames[craft.owner_id] || 'Unknown creator'}</p>
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
                <p className="home__empty-title">No crafts documented yet.</p>
                <p className="home__empty-sub">Be the first to preserve a craft's story as a digital twin.</p>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}
