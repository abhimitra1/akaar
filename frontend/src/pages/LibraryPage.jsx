import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient.js'
import { useAuth } from '../context/AuthContext.jsx'
import AppNav from '../components/AppNav.jsx'
import LoadingScreen from '../components/LoadingScreen.jsx'
import '../pages/Home.css'
import './Library.css'

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'processing', label: 'Processing' },
  { key: 'completed', label: 'Completed' },
  { key: 'failed', label: 'Failed' },
  { key: 'published', label: 'Published' },
]

function statusOf(craft, latestJobByCraft) {
  return latestJobByCraft[craft.id]?.status || null
}

function StatusBadge({ craft, latestJobByCraft }) {
  const status = statusOf(craft, latestJobByCraft)
  if (craft.is_public) return <span className="library__badge library__badge--published">Published</span>
  if (status === 'completed') return <span className="library__badge library__badge--completed">Completed</span>
  if (status === 'failed') return <span className="library__badge library__badge--failed">Failed</span>
  if (status === 'queued' || status === 'processing') {
    return <span className="library__badge library__badge--processing">Processing</span>
  }
  return null
}

// My Library (AGENTS.md §3 Phase 5, logged in only): tabs All/Processing/Completed/
// Failed/Published. Pull-to-refresh, infinite scroll, long-press menu are phase 2 (§9).
export default function LibraryPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [crafts, setCrafts] = useState([])
  const [latestJobByCraft, setLatestJobByCraft] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('all')

  useEffect(() => {
    if (!user) return
    const load = async () => {
      try {
        const { data: ownCrafts, error: craftsError } = await supabase
          .from('crafts')
          .select('*')
          .eq('owner_id', user.id)
          .order('created_at', { ascending: false })
        if (craftsError) throw new Error(craftsError.message)
        setCrafts(ownCrafts)

        const craftIds = ownCrafts.map((c) => c.id)
        if (craftIds.length > 0) {
          const { data: jobs } = await supabase
            .from('jobs')
            .select('*')
            .in('craft_id', craftIds)
            .order('created_at', { ascending: false })
          if (jobs) {
            const latest = {}
            for (const job of jobs) {
              if (!(job.craft_id in latest)) latest[job.craft_id] = job
            }
            setLatestJobByCraft(latest)
          }
        }
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user])

  const getCraftThumbnail = (craft) =>
    craft.photos && craft.photos.length > 0 ? craft.photos[0] : null

  const visibleCrafts = crafts.filter((craft) => {
    const status = statusOf(craft, latestJobByCraft)
    switch (activeTab) {
      case 'processing':
        return status === 'queued' || status === 'processing'
      case 'completed':
        return status === 'completed'
      case 'failed':
        return status === 'failed'
      case 'published':
        return craft.is_public === true
      default:
        return true
    }
  })

  const handleOpen = (craft) => {
    const job = latestJobByCraft[craft.id]
    if (job && (job.status === 'queued' || job.status === 'processing')) {
      navigate(`/processing/${job.id}`)
    } else {
      navigate(`/craft/${craft.id}`)
    }
  }

  if (loading) {
    return <LoadingScreen message="Loading your library..." />
  }

  return (
    <div className="home">
      <AppNav active="library" />

      <section className="home__content">
        <h1 className="home__title">My Library</h1>

        {error && <p className="explore__error">{error}</p>}

        <div className="home__filters">
          <div className="home__filter-row">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                className={`home__chip ${activeTab === tab.key ? 'home__chip--active' : ''}`}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {visibleCrafts.length > 0 ? (
          <div className="home__recent-list">
            {visibleCrafts.map((craft) => (
              <article key={craft.id} className="home__recent-row" onClick={() => handleOpen(craft)}>
                <div className="home__recent-thumbnail-wrapper">
                  {getCraftThumbnail(craft) ? (
                    <img src={getCraftThumbnail(craft)} alt={craft.title || 'Untitled'} className="home__recent-thumbnail" loading="lazy" />
                  ) : (
                    <div className="home__recent-placeholder" />
                  )}
                </div>
                <div className="home__recent-body">
                  <h3 className="home__recent-title">{craft.title || 'Untitled'}</h3>
                  <p className="home__recent-subtitle">
                    {craft.craft_type || 'Craft'} · {new Date(craft.created_at).toLocaleDateString()}
                  </p>
                </div>
                <StatusBadge craft={craft} latestJobByCraft={latestJobByCraft} />
                <button
                  type="button"
                  className="library__edit"
                  aria-label="Edit details"
                  onClick={(e) => {
                    e.stopPropagation()
                    navigate(`/craft/${craft.id}/metadata`)
                  }}
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </svg>
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="home__empty-state">
            <p className="home__empty-title">No models here yet.</p>
            <p className="home__empty-sub">Create your first digital twin!</p>
          </div>
        )}
      </section>
    </div>
  )
}
