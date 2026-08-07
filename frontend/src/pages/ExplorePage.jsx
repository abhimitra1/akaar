import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient.js'
import AppNav from '../components/AppNav.jsx'
import LoadingScreen from '../components/LoadingScreen.jsx'
import '../pages/Home.css'
import './Explore.css'

const CATEGORY_CHIPS = ['Pottery', 'Textiles', 'Wood', 'Metal']

// Search & Explore (AGENTS.md §3 Phase 1): public gallery, guest-accessible. Text
// search (title/story) + craft-type filter chips are core; semantic search, sort by
// popularity/downloads, voice, autocomplete are phase 2 (§9) — not built.
export default function ExplorePage() {
  const navigate = useNavigate()
  const [crafts, setCrafts] = useState([])
  const [ownerNames, setOwnerNames] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')

  useEffect(() => {
    const fetchCrafts = async () => {
      try {
        // Explore is the public gallery — only published crafts, regardless of who's viewing.
        const { data, error: dbError } = await supabase
          .from('crafts')
          .select('*')
          .eq('is_public', true)
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
  }, [])

  const getCraftThumbnail = (craft) =>
    craft.photos && craft.photos.length > 0 ? craft.photos[0] : null

  const q = query.trim().toLowerCase()
  const visibleCrafts = crafts.filter((c) => {
    if (selectedCategory && c.craft_type !== selectedCategory) return false
    if (q && !`${c.title || ''} ${c.story || ''}`.toLowerCase().includes(q)) return false
    return true
  })

  if (loading) {
    return <LoadingScreen message="Loading crafts..." />
  }

  return (
    <div className="home">
      <AppNav active="explore" />

      <section className="home__content">
        <h1 className="home__title">Explore</h1>

        {error && <p className="explore__error">{error}</p>}

        <div className="explore__search-wrap">
          <svg className="explore__search-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="search"
            className="explore__search"
            placeholder="Search crafts by title or story"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="home__filters">
          <div className="home__filter-row">
            {CATEGORY_CHIPS.map((chip) => (
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

        {visibleCrafts.length > 0 ? (
          <div className="home__recent-list">
            {visibleCrafts.map((craft) => (
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
            <p className="home__empty-title">No crafts found.</p>
            <p className="home__empty-sub">Try a different search or filter.</p>
          </div>
        )}
      </section>
    </div>
  )
}
