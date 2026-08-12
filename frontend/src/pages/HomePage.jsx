import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient.js'
import { useAuth } from '../context/AuthContext.jsx'
import AppNav from '../components/AppNav.jsx'
import AiGeneratedBadge from '../components/AiGeneratedBadge.jsx'
import LoadingScreen from '../components/LoadingScreen.jsx'
import './Home.css'

const CATEGORY_CHIPS = ['Pottery', 'Terracotta', 'Wood', 'Metal']

// Each banner's own baked-in copy already points at a specific next step (or, for the
// mission banner, summarizes the platform) — href just makes that real navigation instead
// of a static image. /library and /create are ProtectedRoutes like everywhere else they're
// linked from; a guest tapping either gets the normal sign-in bounce, nothing
// special-cased here. Order mirrors the sidebar's own nav order (Explore, Create, Library)
// after the intro mission banner.
const HERO_BANNERS = [
  {
    src: '/brand/hero_banners/paths_hero_01_preserving_heritage.png',
    alt: 'Preserving Heritage. Empowering Futures. PATHS is a digital platform for pottery and craft heritage — we document, digitize and reimagine traditional crafts through design thinking and technology.',
    href: '/about',
  },
  {
    src: '/brand/hero_banners/4_banner.png',
    alt: 'Collaborate. Co-create. Create Real Impact. PATHS brings together artisans, designers, technologists and communities to build a sustainable craft ecosystem.',
    href: '/explore',
  },
  {
    src: '/brand/hero_banners/6_banner.png',
    alt: 'Document. Digitize. Preserve. For Generations to Come. We capture the essence of traditional crafts and transform them into digital heritage — accurate, accessible and timeless.',
    href: '/create',
  },
  {
    src: '/brand/hero_banners/5_banner.png',
    alt: 'Learn from the Past. Design for the Future. Dive into techniques, processes and stories — inspiration for creators, designers and changemakers.',
    href: '/library',
  },
]

// Auto-advance interval — a `setTimeout` re-armed on every heroIndex change (rather than a
// bare `setInterval`) so a manual dot click resets the 8s countdown instead of the next
// auto-advance landing right on top of it.
const HERO_AUTOPLAY_MS = 8000

export default function HomePage() {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()
  const [crafts, setCrafts] = useState([])
  const [ownerNames, setOwnerNames] = useState({}) // owner_id -> full_name
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')

  // Hero banner carousel: native horizontal scroll-snap (touch/trackpad swipe just works)
  // plus dots for click navigation — heroIndex is derived from scroll position rather than
  // driving it, so the two never fight each other.
  const [heroIndex, setHeroIndex] = useState(0)
  const [heroPaused, setHeroPaused] = useState(false)
  const heroTrackRef = useRef(null)

  const handleHeroScroll = () => {
    const el = heroTrackRef.current
    if (!el) return
    setHeroIndex(Math.round(el.scrollLeft / el.clientWidth))
  }

  const scrollToHero = (index) => {
    const el = heroTrackRef.current
    if (!el) return
    el.scrollTo({ left: index * el.clientWidth, behavior: 'smooth' })
  }

  // Advances to the next slide (wrapping around) every HERO_AUTOPLAY_MS — paused while the
  // pointer is over the carousel so a slide someone's actively reading doesn't slide away
  // mid-sentence. Re-armed on every heroIndex change, whether that came from this timer, a
  // dot click, or a manual swipe, so there's always exactly one countdown running.
  useEffect(() => {
    if (heroPaused || HERO_BANNERS.length <= 1) return
    const id = setTimeout(() => {
      scrollToHero((heroIndex + 1) % HERO_BANNERS.length)
    }, HERO_AUTOPLAY_MS)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heroIndex, heroPaused])

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
        <div className="home__hero" onMouseEnter={() => setHeroPaused(true)} onMouseLeave={() => setHeroPaused(false)}>
          <div className="home__hero-track" ref={heroTrackRef} onScroll={handleHeroScroll}>
            {HERO_BANNERS.map((banner, i) => (
              <Link key={banner.href} to={banner.href} className="home__hero-slide">
                <img src={banner.src} alt={banner.alt} loading={i === 0 ? 'eager' : 'lazy'} />
              </Link>
            ))}
          </div>
          <div className="home__hero-dots">
            {HERO_BANNERS.map((banner, i) => (
              <button
                key={banner.href}
                type="button"
                className={`home__hero-dot ${heroIndex === i ? 'home__hero-dot--active' : ''}`}
                aria-label={`Go to slide ${i + 1}`}
                aria-current={heroIndex === i}
                onClick={() => scrollToHero(i)}
              />
            ))}
          </div>
        </div>

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
              <h2 className="home__section-title">Recent Designs</h2>
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
